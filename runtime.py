from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass

from collector import ProcCollector
from exceptions import InvalidConfigurationError
from models import MemorySnapshot
from storage import InMemorySnapshotStore

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class RuntimeState:
    is_running: bool
    sample_interval_seconds: int
    snapshot_count: int
    last_error: str | None
    last_updated_at: float | None


class MonitorRuntime:
    """Background sampling runtime for collecting and storing memory snapshots."""

    def __init__(
        self,
        collector: ProcCollector,
        store: InMemorySnapshotStore,
        sample_interval_seconds: int = 1,
    ) -> None:
        if sample_interval_seconds < 1:
            raise InvalidConfigurationError("sample_interval_seconds must be greater than zero")
        self._collector = collector
        self._store = store
        self._sample_interval_seconds = sample_interval_seconds
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._last_error: str | None = None
        self._last_updated_at: float | None = None

    @property
    def sample_interval_seconds(self) -> int:
        return self._sample_interval_seconds

    def start(self) -> None:
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._stop_event.clear()
            thread = threading.Thread(target=self._run_loop, name="mem-monitor-runtime", daemon=True)
            self._thread = thread
        self.collect_once()
        thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        with self._lock:
            thread = self._thread
            self._thread = None
        if thread is not None and thread.is_alive():
            thread.join(timeout=self._sample_interval_seconds + 2)

    def collect_once(self) -> MemorySnapshot | None:
        try:
            snapshot = self._collector.collect_snapshot()
        except Exception as exc:  # pragma: no cover - defensive boundary
            logger.error("Snapshot collection failed", exc_info=True)
            with self._lock:
                self._last_error = str(exc)
            return None

        self._store.append(snapshot)
        with self._lock:
            self._last_error = None
            self._last_updated_at = snapshot.timestamp
        return snapshot

    def state(self) -> RuntimeState:
        with self._lock:
            thread = self._thread
            return RuntimeState(
                is_running=thread is not None and thread.is_alive(),
                sample_interval_seconds=self._sample_interval_seconds,
                snapshot_count=self._store.size(),
                last_error=self._last_error,
                last_updated_at=self._last_updated_at,
            )

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            started_at = time.monotonic()
            self.collect_once()
            elapsed = time.monotonic() - started_at
            wait_time = max(0.0, self._sample_interval_seconds - elapsed)
            if self._stop_event.wait(wait_time):
                break
