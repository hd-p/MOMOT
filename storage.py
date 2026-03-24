from __future__ import annotations

from collections import deque
from threading import Lock

from exceptions import InvalidConfigurationError
from models import MemorySnapshot


class InMemorySnapshotStore:
    """Thread-safe in-memory store for collected snapshots."""

    def __init__(self, max_snapshots: int = 7200) -> None:
        if max_snapshots < 1:
            raise InvalidConfigurationError("max_snapshots must be greater than zero")
        self._snapshots: deque[MemorySnapshot] = deque(maxlen=max_snapshots)
        self._lock = Lock()

    def append(self, snapshot: MemorySnapshot) -> None:
        with self._lock:
            self._snapshots.append(snapshot)

    def latest(self) -> MemorySnapshot | None:
        with self._lock:
            if not self._snapshots:
                return None
            return self._snapshots[-1]

    def oldest(self) -> MemorySnapshot | None:
        with self._lock:
            if not self._snapshots:
                return None
            return self._snapshots[0]

    def list_snapshots(self) -> list[MemorySnapshot]:
        with self._lock:
            return list(self._snapshots)

    def size(self) -> int:
        with self._lock:
            return len(self._snapshots)
