from __future__ import annotations


class MonitorError(Exception):
    """Base exception for the mem_monitor application."""


class CollectorReadError(MonitorError):
    """Raised when the collector cannot read required /proc data."""


class InvalidConfigurationError(MonitorError):
    """Raised when runtime configuration is invalid."""
