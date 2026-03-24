from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ProcessSnapshot:
    pid: int
    name: str
    rss_kb: int

    @property
    def rss_mb(self) -> float:
        return round(self.rss_kb / 1024, 1)


@dataclass(frozen=True, slots=True)
class MemorySnapshot:
    timestamp: float
    mem_total_kb: int
    mem_available_kb: int
    mem_free_kb: int
    buffers_kb: int
    cached_kb: int
    swap_total_kb: int
    swap_free_kb: int
    processes: tuple[ProcessSnapshot, ...]

    @property
    def mem_used_kb(self) -> int:
        return max(0, self.mem_total_kb - self.mem_available_kb)

    @property
    def mem_used_mb(self) -> float:
        return round(self.mem_used_kb / 1024, 1)

    @property
    def mem_available_mb(self) -> float:
        return round(self.mem_available_kb / 1024, 1)

    @property
    def mem_total_mb(self) -> float:
        return round(self.mem_total_kb / 1024, 1)

    @property
    def mem_used_percent(self) -> float:
        if self.mem_total_kb <= 0:
            return 0.0
        return round(self.mem_used_kb / self.mem_total_kb * 100, 1)

    @property
    def swap_used_kb(self) -> int:
        return max(0, self.swap_total_kb - self.swap_free_kb)

    @property
    def swap_used_mb(self) -> float:
        return round(self.swap_used_kb / 1024, 1)

    @property
    def swap_total_mb(self) -> float:
        return round(self.swap_total_kb / 1024, 1)

    @property
    def swap_used_percent(self) -> float:
        if self.swap_total_kb <= 0:
            return 0.0
        return round(self.swap_used_kb / self.swap_total_kb * 100, 1)

    def process_map(self) -> dict[int, ProcessSnapshot]:
        return {process.pid: process for process in self.processes}
