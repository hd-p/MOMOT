from __future__ import annotations

import time
from typing import Any

from models import MemorySnapshot, ProcessSnapshot
from runtime import MonitorRuntime
from storage import InMemorySnapshotStore


class DashboardService:
    """Transforms stored snapshots into view models for CLI and HTTP consumers."""

    def __init__(self, store: InMemorySnapshotStore, runtime: MonitorRuntime) -> None:
        self._store = store
        self._runtime = runtime

    def build_dashboard_payload(self) -> dict[str, Any]:
        snapshots = self._store.list_snapshots()
        latest = snapshots[-1] if snapshots else None
        state = self._build_state_payload(latest)
        if latest is None:
            return {
                "state": state,
                "summary": self._empty_summary(),
                "top_holders": [],
                "top_risers": [],
                "memory_share": [],
                "watchlist": [],
                "trend_series": [],
                "system_trend": [],
                "all_processes": [],
            }

        oldest = snapshots[0]
        baseline_30s = self._snapshot_before(snapshots, latest.timestamp - 30)
        holders = self._build_top_holders(latest, baseline_30s, oldest)
        risers = self._build_top_risers(latest, baseline_30s, oldest)
        watchlist = self._build_watchlist(holders, risers)
        trend_series = self._build_trend_series(snapshots, holders, risers)
        all_processes = self._build_all_processes(latest, baseline_30s, oldest)
        system_trend = [
            {"timestamp": s.timestamp, "used_mb": s.mem_used_mb, "total_mb": s.mem_total_mb}
            for s in snapshots
        ]

        return {
            "state": state,
            "summary": self._build_summary(latest, holders, risers, watchlist),
            "top_holders": holders,
            "top_risers": risers,
            "memory_share": self._build_memory_share(latest),
            "watchlist": watchlist,
            "trend_series": trend_series,
            "system_trend": system_trend,
            "all_processes": all_processes,
        }

    def build_health_payload(self) -> dict[str, Any]:
        latest = self._store.latest()
        state = self._build_state_payload(latest)
        return {
            "service": "mem_monitor",
            "state": state,
        }

    def _build_state_payload(self, latest: MemorySnapshot | None) -> dict[str, Any]:
        runtime_state = self._runtime.state()
        now = time.time()
        is_stale = (
            runtime_state.last_updated_at is not None
            and now - runtime_state.last_updated_at > runtime_state.sample_interval_seconds * 2.5
        )

        if latest is None:
            code = "warming_up"
            message = "采集尚未开始，请等待第一批样本。"
        elif runtime_state.last_error is not None and is_stale:
            code = "source_disconnected"
            message = "数据源暂时断开，当前展示的是最近一次成功采样结果。"
        elif runtime_state.snapshot_count < 2:
            code = "warming_up"
            message = "正在采集首批样本，趋势图会在几秒内稳定。"
        else:
            code = "live"
            message = "实时数据正常。"

        return {
            "code": code,
            "message": message,
            "snapshot_count": runtime_state.snapshot_count,
            "sample_interval_seconds": runtime_state.sample_interval_seconds,
            "last_updated_at": runtime_state.last_updated_at,
            "runtime_error": runtime_state.last_error,
        }

    def _empty_summary(self) -> dict[str, Any]:
        return {
            "used_percent": 0.0,
            "used_mb": 0.0,
            "total_mb": 0.0,
            "available_mb": 0.0,
            "pressure": "unknown",
            "top_holder": None,
            "top_riser": None,
            "watch_focus": None,
        }

    def _build_summary(
        self,
        latest: MemorySnapshot,
        holders: list[dict[str, Any]],
        risers: list[dict[str, Any]],
        watchlist: list[dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "used_percent": latest.mem_used_percent,
            "used_mb": latest.mem_used_mb,
            "total_mb": latest.mem_total_mb,
            "available_mb": latest.mem_available_mb,
            "swap_used_mb": latest.swap_used_mb,
            "swap_total_mb": latest.swap_total_mb,
            "pressure": self._pressure_label(latest.mem_used_percent),
            "top_holder": holders[0] if holders else None,
            "top_riser": risers[0] if risers else None,
            "watch_focus": watchlist[0] if watchlist else None,
        }

    def _build_top_holders(
        self,
        latest: MemorySnapshot,
        baseline_30s: MemorySnapshot,
        oldest: MemorySnapshot,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        return [
            self._process_payload(process, latest, baseline_30s, oldest)
            for process in latest.processes[:limit]
        ]

    def _build_top_risers(
        self,
        latest: MemorySnapshot,
        baseline_30s: MemorySnapshot,
        oldest: MemorySnapshot,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        latest_map = latest.process_map()
        baseline_map = baseline_30s.process_map()
        oldest_map = oldest.process_map()
        ranked: list[tuple[float, ProcessSnapshot]] = []

        for process in latest.processes:
            delta_30s_mb = self._delta_mb(process.pid, latest_map, baseline_map)
            delta_since_start_mb = self._delta_mb(process.pid, latest_map, oldest_map)
            score = max(delta_30s_mb, 0.0) * 2 + max(delta_since_start_mb, 0.0)
            if score <= 0:
                continue
            ranked.append((score, process))

        ranked.sort(key=lambda item: item[0], reverse=True)
        return [
            self._process_payload(process, latest, baseline_30s, oldest)
            for _, process in ranked[:limit]
        ]

    def _build_watchlist(
        self,
        holders: list[dict[str, Any]],
        risers: list[dict[str, Any]],
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        merged: dict[int, dict[str, Any]] = {}
        for item in holders + risers:
            pid = item["pid"]
            existing = merged.get(pid)
            if existing is None or item["watch_score"] > existing["watch_score"]:
                merged[pid] = item
        ranked = sorted(merged.values(), key=lambda item: item["watch_score"], reverse=True)
        return ranked[:limit]

    def _build_memory_share(self, latest: MemorySnapshot, limit: int = 5) -> list[dict[str, Any]]:
        top_processes = list(latest.processes[:limit])
        top_total_kb = sum(process.rss_kb for process in top_processes)
        items = [
            {
                "pid": process.pid,
                "name": process.name,
                "rss_mb": round(process.rss_kb / 1024, 1),
                "share_percent": round(process.rss_kb / latest.mem_total_kb * 100, 1)
                if latest.mem_total_kb > 0
                else 0.0,
            }
            for process in top_processes
        ]
        others_kb = max(0, sum(process.rss_kb for process in latest.processes) - top_total_kb)
        if others_kb > 0:
            items.append(
                {
                    "pid": 0,
                    "name": "others",
                    "rss_mb": round(others_kb / 1024, 1),
                    "share_percent": round(others_kb / latest.mem_total_kb * 100, 1)
                    if latest.mem_total_kb > 0
                    else 0.0,
                }
            )
        return items

    def _build_trend_series(
        self,
        snapshots: list[MemorySnapshot],
        holders: list[dict[str, Any]],
        risers: list[dict[str, Any]],
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        selected: list[tuple[int, str]] = []
        seen: set[int] = set()
        for item in risers + holders:
            pid = item["pid"]
            if pid in seen:
                continue
            seen.add(pid)
            selected.append((pid, item["name"]))
            if len(selected) >= limit:
                break

        series: list[dict[str, Any]] = []
        for pid, name in selected:
            points: list[dict[str, Any]] = []
            for snapshot in snapshots:
                process = snapshot.process_map().get(pid)
                if process is None:
                    continue
                points.append(
                    {
                        "timestamp": snapshot.timestamp,
                        "rss_mb": round(process.rss_kb / 1024, 1),
                    }
                )
            if points:
                series.append({"pid": pid, "name": name, "points": points})
        return series

    def _process_payload(
        self,
        process: ProcessSnapshot,
        latest: MemorySnapshot,
        baseline_30s: MemorySnapshot,
        oldest: MemorySnapshot,
    ) -> dict[str, Any]:
        latest_map = latest.process_map()
        baseline_map = baseline_30s.process_map()
        oldest_map = oldest.process_map()
        delta_30s_mb = self._delta_mb(process.pid, latest_map, baseline_map)
        delta_since_start_mb = self._delta_mb(process.pid, latest_map, oldest_map)
        share_percent = round(process.rss_kb / latest.mem_total_kb * 100, 1) if latest.mem_total_kb > 0 else 0.0
        watch_score = round(process.rss_mb + max(delta_30s_mb, 0.0) * 5 + max(delta_since_start_mb, 0.0), 1)
        return {
            "pid": process.pid,
            "name": process.name,
            "rss_mb": process.rss_mb,
            "share_percent": share_percent,
            "delta_30s_mb": delta_30s_mb,
            "delta_since_start_mb": delta_since_start_mb,
            "status": self._status_label(delta_30s_mb, delta_since_start_mb),
            "watch_score": watch_score,
        }

    def _snapshot_before(self, snapshots: list[MemorySnapshot], threshold: float) -> MemorySnapshot:
        for snapshot in reversed(snapshots):
            if snapshot.timestamp <= threshold:
                return snapshot
        return snapshots[0]

    def _delta_mb(
        self,
        pid: int,
        latest_map: dict[int, ProcessSnapshot],
        baseline_map: dict[int, ProcessSnapshot],
    ) -> float:
        latest_process = latest_map.get(pid)
        if latest_process is None:
            return 0.0
        baseline_process = baseline_map.get(pid)
        baseline_kb = baseline_process.rss_kb if baseline_process is not None else 0
        return round((latest_process.rss_kb - baseline_kb) / 1024, 1)

    def _pressure_label(self, used_percent: float) -> str:
        if used_percent >= 90:
            return "critical"
        if used_percent >= 75:
            return "elevated"
        return "normal"

    def _status_label(self, delta_30s_mb: float, delta_since_start_mb: float) -> str:
        if delta_30s_mb >= 128 or delta_since_start_mb >= 512:
            return "rising"
        if abs(delta_30s_mb) >= 64:
            return "spiky"
        return "steady"

    def _build_all_processes(
        self,
        latest: MemorySnapshot,
        baseline_30s: MemorySnapshot,
        oldest: MemorySnapshot,
    ) -> list[dict[str, Any]]:
        return [
            self._process_payload(process, latest, baseline_30s, oldest)
            for process in latest.processes
            if process.rss_kb > 0
        ]

    def build_process_trend(self, pid: int) -> dict[str, Any]:
        snapshots = self._store.list_snapshots()
        points: list[dict[str, Any]] = []
        name: str = ""
        for snapshot in snapshots:
            process = snapshot.process_map().get(pid)
            if process is None:
                continue
            if not name:
                name = process.name
            points.append({"timestamp": snapshot.timestamp, "rss_mb": round(process.rss_kb / 1024, 1)})
        return {"pid": pid, "name": name, "points": points}
