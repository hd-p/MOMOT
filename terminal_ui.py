from __future__ import annotations

import fcntl
import struct
import sys
import termios
import time
from typing import Any


class TerminalRenderer:
    """Renders the dashboard payload into a terminal-friendly layout."""

    def enter_alt_screen(self) -> None:
        sys.stdout.write("\033[?1049h\033[?25l")
        sys.stdout.flush()

    def leave_alt_screen(self) -> None:
        sys.stdout.write("\033[?25h\033[?1049l")
        sys.stdout.flush()

    def render(self, payload: dict[str, Any], top_n: int) -> None:
        rows, cols = self._terminal_size()
        summary = payload["summary"]
        state = payload["state"]
        top_holders = payload["top_holders"][:top_n]
        watchlist = payload["watchlist"][:top_n]

        used_percent = float(summary["used_percent"])
        pressure_color = self._pressure_color(summary["pressure"])
        bar_width = max(10, min(30, cols - 28))
        filled = int(bar_width * used_percent / 100)
        bar = "█" * filled + "░" * (bar_width - filled)

        lines = [
            f"\033[1;36m{'═' * max(20, min(cols - 1, 72))}\033[0m",
            f"\033[1;37m  mem_monitor\033[0m  {time.strftime('%Y-%m-%d %H:%M:%S')}",
            f"\033[1;36m{'═' * max(20, min(cols - 1, 72))}\033[0m",
            "",
            f"  状态: {state['message']}",
            f"  内存使用率: {pressure_color}[{bar}] {used_percent:.1f}%\033[0m",
            f"  已用: {summary['used_mb']:.1f} MB  可用: {summary['available_mb']:.1f} MB  总计: {summary['total_mb']:.1f} MB",
        ]

        if summary["top_holder"] is not None:
            holder = summary["top_holder"]
            lines.append(
                f"  最大占用: {holder['name']} ({holder['rss_mb']:.1f} MB / {holder['share_percent']:.1f}%)"
            )
        if summary["top_riser"] is not None:
            riser = summary["top_riser"]
            lines.append(
                f"  最快上涨: {riser['name']} ({riser['delta_30s_mb']:+.1f} MB / 30s)"
            )

        lines.extend(
            [
                "",
                f"  \033[1;37m{'PID':>7}  {'进程名':<18} {'RSS(MB)':>10} {'30s变化':>10} {'状态':>8}\033[0m",
                f"  {'─' * max(20, min(cols - 3, 68))}",
            ]
        )

        for item in top_holders:
            lines.append(
                f"  {item['pid']:>7}  {item['name']:<18.18} {item['rss_mb']:>10.1f} {item['delta_30s_mb']:>+10.1f} {item['status']:>8}"
            )

        if watchlist:
            lines.extend([
                "",
                "  \033[1;37mWatchlist\033[0m",
            ])
            for item in watchlist[: min(3, len(watchlist))]:
                lines.append(
                    f"  - {item['name']}  {item['rss_mb']:.1f} MB  {item['delta_since_start_mb']:+.1f} MB since start  [{item['status']}]"
                )

        lines.append("")
        lines.append(
            f"  \033[2m样本数: {state['snapshot_count']}  |  刷新: {state['sample_interval_seconds']}s  |  Ctrl+C 退出\033[0m"
        )

        output = "\n".join(lines[:rows])
        sys.stdout.write("\033[H\033[J" + output)
        sys.stdout.flush()

    def _terminal_size(self) -> tuple[int, int]:
        try:
            rows, cols = struct.unpack(
                "HH",
                fcntl.ioctl(sys.stdout.fileno(), termios.TIOCGWINSZ, b"\x00" * 4),
            )
            return rows, cols
        except OSError:
            return 24, 80

    def _pressure_color(self, pressure: str) -> str:
        if pressure == "critical":
            return "\033[1;31m"
        if pressure == "elevated":
            return "\033[1;33m"
        return "\033[1;32m"
