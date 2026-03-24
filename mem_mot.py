#!/usr/bin/env python3
from __future__ import annotations

import argparse
import logging
import signal
import sys
import time
import webbrowser
from threading import Timer

from app import create_app
from collector import ProcCollector
from runtime import MonitorRuntime
from service import DashboardService
from storage import InMemorySnapshotStore
from terminal_ui import TerminalRenderer

logger = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="memory-first local monitor")
    parser.add_argument("mode", nargs="?", choices=("cli", "serve"), default="cli")
    parser.add_argument("-i", "--interval", type=int, default=1, help="采样间隔（秒）")
    parser.add_argument("-n", "--top", type=int, default=5, help="终端模式显示前 N 个进程")
    parser.add_argument("--history", type=int, default=7200, help="内存中保留的快照数")
    parser.add_argument("--host", default="127.0.0.1", help="本地服务监听地址")
    parser.add_argument("--port", type=int, default=8765, help="本地服务端口")
    parser.add_argument("--log-level", default="INFO", help="日志级别")
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="serve 模式下不自动打开浏览器",
    )
    return parser


def configure_logging(level_name: str) -> None:
    level = getattr(logging, level_name.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )


def build_runtime(args: argparse.Namespace) -> tuple[MonitorRuntime, DashboardService]:
    collector = ProcCollector()
    store = InMemorySnapshotStore(max_snapshots=args.history)
    runtime = MonitorRuntime(
        collector=collector,
        store=store,
        sample_interval_seconds=max(1, args.interval),
    )
    dashboard_service = DashboardService(store=store, runtime=runtime)
    return runtime, dashboard_service


def run_cli(runtime: MonitorRuntime, dashboard_service: DashboardService, top_n: int) -> int:
    renderer = TerminalRenderer()
    stop_requested = False

    def handle_signal(signum: int, _frame: object) -> None:
        nonlocal stop_requested
        logger.info("Received signal %s, stopping CLI renderer", signum)
        stop_requested = True

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    runtime.start()
    renderer.enter_alt_screen()
    try:
        while not stop_requested:
            renderer.render(dashboard_service.build_dashboard_payload(), top_n=top_n)
            if stop_requested:
                break
            time.sleep(runtime.sample_interval_seconds)
    except KeyboardInterrupt:
        logger.info("CLI renderer interrupted by keyboard")
    finally:
        runtime.stop()
        renderer.leave_alt_screen()
        sys.stdout.write("mem_monitor exited.\n")
        sys.stdout.flush()
    return 0


def run_server(
    runtime: MonitorRuntime,
    dashboard_service: DashboardService,
    host: str,
    port: int,
    open_browser: bool,
) -> int:
    try:
        import uvicorn
    except ImportError as exc:  # pragma: no cover - dependency boundary
        logger.error("uvicorn is required for serve mode", exc_info=True)
        raise SystemExit("serve 模式需要先安装 uvicorn 和 fastapi") from exc

    app = create_app(runtime=runtime, dashboard_service=dashboard_service)

    browser_timer: Timer | None = None
    if open_browser:
        url = f"http://{host}:{port}/"

        def open_dashboard() -> None:
            time.sleep(2)
            webbrowser.open(url, new=2)

        browser_timer = Timer(0.5, open_dashboard)
        browser_timer.daemon = True
        browser_timer.start()
        logger.info("Dashboard will be available at %s", url)

    try:
        uvicorn.run(app, host=host, port=port, log_level="info", ws="wsproto")
    finally:
        if browser_timer is not None:
            browser_timer.cancel()
    return 0


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    configure_logging(args.log_level)
    runtime, dashboard_service = build_runtime(args)

    if args.mode == "serve":
        return run_server(
            runtime,
            dashboard_service,
            host=args.host,
            port=args.port,
            open_browser=not args.no_browser,
        )
    return run_cli(runtime, dashboard_service, top_n=max(1, args.top))


if __name__ == "__main__":
    raise SystemExit(main())
