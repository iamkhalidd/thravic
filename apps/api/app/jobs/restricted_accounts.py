"""Delete accounts restricted for being under 18 once their grace period ends.

A restricted account's dashboard is locked and its sites stop collecting at once
(see `routers/auth._refuse_underage`); the data is kept for
`UNDERAGE_GRACE_DAYS` so support can correct a mistyped date of birth, then the
account and everything it owns is deleted here.
"""

from __future__ import annotations

from datetime import UTC, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..db import query
from ..logging import create_logger
from ..profile import UNDERAGE, UNDERAGE_GRACE_DAYS
from .runner import run_if_due

log = create_logger("Job")

JOB_NAME = "restricted_accounts"
RUN_EVERY = timedelta(hours=6)


async def delete_expired_restrictions() -> dict[str, Any]:
    due = await query(
        """
        SELECT id FROM users
        WHERE restricted_reason = $1
          AND restricted_at < NOW() - make_interval(days => $2)
        """,
        UNDERAGE,
        UNDERAGE_GRACE_DAYS,
    )
    deleted = failed = 0
    for row in due:
        try:
            # Cascades to the user's sites and their data.
            await query("DELETE FROM users WHERE id = $1", row["id"])
            deleted += 1
        except Exception as exc:  # noqa: BLE001 — one blocked delete must not stop the rest
            failed += 1
            log.error(f"[Jobs] Could not delete restricted account {row['id']}: {exc}")
    if deleted:
        log.info(f"[Jobs] Deleted {deleted} restricted under-18 accounts")
    return {"deleted": deleted, "failed": failed}


async def _scheduled() -> None:
    try:
        await run_if_due(JOB_NAME, RUN_EVERY, delete_expired_restrictions)
    except Exception as exc:  # noqa: BLE001 — a failed run must not stop the schedule
        log.error(f"[Jobs] Restricted account cleanup failed: {exc}")


def start_restricted_account_job(scheduler: AsyncIOScheduler) -> None:
    log.info("[Jobs] Starting restricted account cleanup (every 6 hours)")
    scheduler.add_job(
        _scheduled,
        trigger=CronTrigger(minute=27, timezone=UTC),
        id=JOB_NAME,
        replace_existing=True,
    )
