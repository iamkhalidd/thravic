"""Structured logging — same levels and JSON shape as the Express logger."""

from __future__ import annotations

import json
import logging
import sys
from collections.abc import MutableMapping
from typing import Any

from .config import get_settings

_LEVELS = {
    "error": logging.ERROR,
    "warn": logging.WARNING,
    "warning": logging.WARNING,
    "info": logging.INFO,
    "debug": logging.DEBUG,
}

_configured = False


class _ContextAdapter(logging.LoggerAdapter):
    """Injects `context` so formatters can render it like the TS logger."""

    def process(
        self, msg: Any, kwargs: MutableMapping[str, Any]
    ) -> tuple[Any, MutableMapping[str, Any]]:
        extra = kwargs.setdefault("extra", {})
        extra.setdefault("context", self.extra.get("context", "-"))
        return msg, kwargs


class _JsonFormatter(logging.Formatter):
    """One JSON object per line, for log aggregators."""

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S.000Z"),
            "level": record.levelname.lower(),
            "context": getattr(record, "context", "-"),
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[1]:
            entry["error"] = {"message": str(record.exc_info[1])}
        return json.dumps(entry)


class _TextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        line = f"[{record.levelname}] [{getattr(record, 'context', '-')}] {record.getMessage()}"
        if record.exc_info and record.exc_info[1]:
            line += f"\n{self.formatException(record.exc_info)}"
        return line


def configure_logging() -> None:
    """Install the root handler once, honouring LOG_LEVEL and NODE_ENV."""
    global _configured
    if _configured:
        return

    settings = get_settings()
    level = _LEVELS.get(settings.LOG_LEVEL.lower(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter() if settings.is_production else _TextFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # Uvicorn installs its own handlers; let it propagate to ours instead so
    # request logs are not duplicated in a different format.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = True

    _configured = True


def create_logger(context: str) -> logging.LoggerAdapter:
    """Equivalent of the Express `createLogger(context)` helper."""
    configure_logging()
    return _ContextAdapter(logging.getLogger("thravic"), {"context": context})
