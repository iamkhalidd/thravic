"""System settings with a 60s in-memory cache — port of `services/settingsService.ts`.

The caching behaviour is deliberate and mirrored exactly: only *found* rows are
cached, and a cache miss is re-queried every time.
"""

from __future__ import annotations

import time
from typing import Any

from ..db import query, query_one
from ..logging import create_logger

log = create_logger("Settings")

CACHE_TTL_SECONDS = 60.0

_cache: dict[str, tuple[Any, float]] = {}


async def get_setting(key: str) -> Any | None:
    """Return a setting value, or `None` if absent or on error."""
    cached = _cache.get(key)
    if cached is not None and cached[1] > time.monotonic():
        return cached[0]

    try:
        row = await query_one("SELECT value FROM system_settings WHERE key = $1", key)
        if row:
            _cache[key] = (row["value"], time.monotonic() + CACHE_TTL_SECONDS)
            return row["value"]
        return None
    except Exception:
        return None


async def set_setting(key: str, value: Any, updated_by: str | None = None) -> None:
    """Upsert a setting and refresh the cache.

    `value` is passed as a plain Python object: the asyncpg `jsonb` codec
    serializes it, so pre-dumping to a string here would double-encode it.
    """
    await query(
        """
        INSERT INTO system_settings (key, value, updated_by, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()
        """,
        key,
        value,
        updated_by,
    )
    _cache[key] = (value, time.monotonic() + CACHE_TTL_SECONDS)


async def get_all_settings() -> dict[str, Any]:
    """Return every setting as a flat dict, warming the cache."""
    rows = await query("SELECT key, value, updated_at FROM system_settings ORDER BY key")
    settings: dict[str, Any] = {}
    for row in rows:
        settings[row["key"]] = row["value"]
        _cache[row["key"]] = (row["value"], time.monotonic() + CACHE_TTL_SECONDS)
    return settings


async def is_enabled(key: str) -> bool:
    """Truthiness helper matching the TS implementation exactly.

    Returns `True` only for JSON `true` or the string `"true"`; anything else —
    including a missing key — is `False`. Several gates depend on this
    behaviour, so it is intentionally not "fixable" here.
    """
    value = await get_setting(key)
    return value is True or value == "true"


def clear_cache() -> None:
    """Drop the cache (used by tests)."""
    _cache.clear()
