"""Trim the admin's logs: `email_log` after 90 days, `ai_usage` after 400.

Both only feed admin pages (a user's email history, the AI cost chart), so old
rows have no use. `ai_usage` is kept just over a year for month-on-month cost.
"""

from __future__ import annotations

from datetime import UTC, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..db import query
from ..logging import create_logger
from .runner import run_if_due

log = create_logger("Job")

JOB_NAME = "log_cleanup"
RUN_EVERY = timedelta(hours=23)
EMAIL_LOG_DAYS = 90
AI_USAGE_DAYS = 400


async def trim_logs() -> dict[str, Any]:
    emails = await query(
        "DELETE FROM email_log WHERE created_at < NOW() - make_interval(days => $1) RETURNING 1",
        EMAIL_LOG_DAYS,
    )
    ai = await query(
        "DELETE FROM ai_usage WHERE created_at < NOW() - make_interval(days => $1) RETURNING 1",
        AI_USAGE_DAYS,
    )
    return {"emailLog": len(emails), "aiUsage": len(ai)}


async def _scheduled() -> None:
    try:
        await run_if_due(JOB_NAME, RUN_EVERY, trim_logs)
    except Exception as exc:  # noqa: BLE001 — a failed run must not stop the schedule
        log.error(f"[Jobs] Log cleanup failed: {exc}")


def start_log_cleanup_job(scheduler: AsyncIOScheduler) -> None:
    log.info("[Jobs] Starting log cleanup (daily)")
    scheduler.add_job(
        _scheduled,
        trigger=CronTrigger(minute=41, timezone=UTC),
        id=JOB_NAME,
        replace_existing=True,
    )
