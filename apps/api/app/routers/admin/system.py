"""Admin system health and database stats — port of `routes/admin/system.ts`.

⚠️ `GET /health` is the one endpoint whose response cannot be identical to the
Node original, because its body is a description of the *process that served it*:
uptime, PID, memory, and the runtime version. Those values are inherently
different for a Python worker, and the parity specs normalise them.

The response **shape is kept identical** so the admin dashboard does not break.
Two substitutions are worth flagging for cutover:

* `nodeVersion` now carries the Python runtime version, in Node's `vX.Y.Z` form.
  The key is retained purely for UI compatibility — it is no longer a Node version.
* `memory.heapUsed` / `heapTotal` / `external` have no Python equivalent. Python
  has no generational heap split to report, so these read `0.0 B` rather than
  being filled with a plausible-looking but invented number.

`/db-stats` is genuinely comparable: it describes the database, not the process.
"""

from __future__ import annotations

import os
import platform as pyplatform
import sys
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter

from ...config import get_settings
from ...db import get_pool, query, query_one
from ...errors import SimpleError
from ...json_response import jsjson
from ...logging import create_logger

log = create_logger("Admin:System")

router = APIRouter()

# `process.uptime()` equivalent — captured at import, which is when uvicorn loads
# the application module.
_STARTED_AT = time.monotonic()


def _count(row: dict | None) -> int:
    return int((row or {}).get("count") or 0)


def format_uptime(seconds: float) -> str:
    """`${d}d ${h}h ${m}m` — truncated, never rounded."""
    days = int(seconds // 86_400)
    hours = int((seconds % 86_400) // 3_600)
    minutes = int((seconds % 3_600) // 60)
    return f"{days}d {hours}h {minutes}m"


def _to_fixed(value: float, digits: int) -> str:
    """`Number.prototype.toFixed` — half away from zero, unlike Python's `round`."""
    factor = 10**digits
    scaled = value * factor
    rounded = int(scaled + 0.5) if scaled >= 0 else -int(-scaled + 0.5)
    return f"{rounded / factor:.{digits}f}"


def format_bytes(size: float) -> str:
    units = ("B", "KB", "MB", "GB")
    index = 0
    value = float(size)
    while value >= 1024 and index < len(units) - 1:
        value /= 1024
        index += 1
    return f"{_to_fixed(value, 1)} {units[index]}"


def _iso_millis(moment: datetime) -> str:
    """`Date.prototype.toISOString()` — always 3 fraction digits and a `Z`."""
    utc = moment.astimezone(UTC)
    return utc.strftime("%Y-%m-%dT%H:%M:%S.") + f"{utc.microsecond // 1000:03d}Z"


def _memory_snapshot() -> dict[str, float]:
    """Best available stand-in for `process.memoryUsage()`.

    `tracemalloc` only reports when tracing has already been enabled, so the
    numbers stay at zero instead of being fabricated.
    """
    used = 0.0
    total = 0.0
    try:
        import tracemalloc

        if tracemalloc.is_tracing():
            current, peak = tracemalloc.get_traced_memory()
            used = float(current)
            total = float(peak)
    except Exception:  # noqa: BLE001 — never fail a health check over this
        pass

    return {"rss": used, "heapUsed": used, "heapTotal": total, "external": 0.0}


@router.get("/health")
@router.get("/health/")
async def health():
    try:
        uptime = time.monotonic() - _STARTED_AT

        db_connected = False
        try:
            await query("SELECT 1")
            db_connected = True
        except Exception:  # noqa: BLE001
            db_connected = False

        try:
            pool = get_pool()
            pool_stats: dict[str, Any] = {
                "totalCount": pool.get_size(),
                "idleCount": pool.get_idle_size(),
                # asyncpg does not expose how many callers are queued for a
                # connection, so this is always 0.
                "waitingCount": 0,
            }
        except Exception:  # noqa: BLE001
            pool_stats = {"totalCount": 0, "idleCount": 0, "waitingCount": 0}

        db_size = await query_one(
            "SELECT pg_size_pretty(pg_database_size(current_database())) as size"
        )

        memory = _memory_snapshot()

        return jsjson(
            {
                "server": {
                    "uptime": int(uptime),
                    "uptimeFormatted": format_uptime(uptime),
                    "restartedAt": _iso_millis(
                        datetime.now(UTC) - timedelta(seconds=uptime)
                    ),
                    "nodeVersion": f"v{pyplatform.python_version()}",
                    "platform": sys.platform,
                    "pid": os.getpid(),
                    "env": get_settings().NODE_ENV or "development",
                },
                "memory": {
                    "rss": format_bytes(memory["rss"]),
                    "heapUsed": format_bytes(memory["heapUsed"]),
                    "heapTotal": format_bytes(memory["heapTotal"]),
                    "external": format_bytes(memory["external"]),
                },
                "database": {
                    "pool": pool_stats,
                    "size": (db_size or {}).get("size") or "unknown",
                    "connected": db_connected,
                },
            }
        )
    except Exception as exc:  # noqa: BLE001
        log.error(f"System health error: {exc}")
        raise SimpleError("Failed to get system health", 500) from None


@router.get("/db-stats")
@router.get("/db-stats/")
async def db_stats():
    try:
        table_sizes = await query(
            """
            SELECT
                relname as table_name,
                n_live_tup as row_count,
                pg_size_pretty(pg_total_relation_size(relid)) as total_size
            FROM pg_stat_user_tables
            ORDER BY pg_total_relation_size(relid) DESC
            """
        )

        connections = await query_one(
            "SELECT COUNT(*) as count FROM pg_stat_activity WHERE state = 'active'"
        )

        slow_queries: list[dict] = []
        try:
            slow_queries = await query(
                """
                SELECT query, calls, mean_exec_time, total_exec_time
                FROM pg_stat_statements
                WHERE mean_exec_time > 1000
                ORDER BY mean_exec_time DESC LIMIT 10
                """
            )
        except Exception:  # noqa: BLE001
            # The extension is usually not installed — Express swallows this too.
            slow_queries = []

        return jsjson(
            {
                "tables": table_sizes,
                "activeConnections": _count(connections),
                "slowQueries": slow_queries,
            }
        )
    except Exception as exc:  # noqa: BLE001
        log.error(f"DB stats error: {exc}")
        raise SimpleError("Failed to get database stats", 500) from None
