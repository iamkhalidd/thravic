"""Run a job at most once per interval, on one instance, whenever the API is awake.

Jobs are in-process (APScheduler) on a host that sleeps when idle and may run
several instances. A fixed-time trigger would be missed while asleep and fire on
every instance, so each job is checked hourly and runs only when:

* this process holds the job's Postgres advisory lock (one instance at a time), and
* `job_runs` says it last completed at least `every` ago.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from .. import db
from ..logging import create_logger

log = create_logger("Jobs")


async def run_if_due(
    name: str, every: timedelta, job: Callable[[], Awaitable[dict[str, Any]]]
) -> bool:
    """Run `job` if it is due; returns whether it ran. Its result is kept in `job_runs`."""
    async with db.get_pool().acquire() as conn:
        # Session-level lock on this connection; released below or when it closes.
        if not await conn.fetchval("SELECT pg_try_advisory_lock(hashtext($1))", name):
            return False
        try:
            last = await conn.fetchval("SELECT last_run_at FROM job_runs WHERE name = $1", name)
            if last is not None and datetime.now(UTC) - last < every:
                return False

            log.info(f"[Jobs] Running {name}")
            details = await job()
            await conn.execute(
                """
                INSERT INTO job_runs (name, last_run_at, details) VALUES ($1, NOW(), $2::jsonb)
                ON CONFLICT (name) DO UPDATE
                SET last_run_at = EXCLUDED.last_run_at, details = EXCLUDED.details
                """,
                name,
                json.loads(json.dumps(details, default=str)),
            )
            return True
        finally:
            await conn.execute("SELECT pg_advisory_unlock(hashtext($1))", name)
