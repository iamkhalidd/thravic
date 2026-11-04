"""Hourly bot check: score each site's visits that have gone quiet (see `bot_service`).

Runs at 20 past the hour, so yesterday's bots are out before the anomaly scan
(35 past) and the hourly daily-totals refresh recount the day.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..db import query
from ..logging import create_logger
from ..services import bot_service
from .runner import run_if_due

log = create_logger("Job")

JOB_NAME = "bot_check"
RUN_EVERY = timedelta(minutes=50)

SITES_QUERY = """
SELECT d.*
FROM domains d
JOIN users u ON u.id = d.user_id
WHERE COALESCE(u.role, 'user') <> 'suspended'
  AND u.restricted_at IS NULL
ORDER BY d.domain
"""


async def check_sites() -> dict[str, Any]:
    await bot_service.remove_old()
    checked = flagged = failed = 0
    for site in await query(SITES_QUERY):
        try:
            result = await bot_service.check_domain(site)
            checked += result["checked"]
            flagged += result["flagged"]
        except Exception as exc:  # noqa: BLE001 — one site must not stop the rest
            log.error(f"[Jobs] Bot check for {site['domain']} failed: {exc}")
            failed += 1
    return {"checked": checked, "flagged": flagged, "failed": failed}


async def _scheduled() -> None:
    try:
        await run_if_due(JOB_NAME, RUN_EVERY, check_sites)
    except Exception as exc:  # noqa: BLE001 — a failed run must not stop the schedule
        log.error(f"[Jobs] Bot check failed: {exc}")


def start_bot_check_job(scheduler: AsyncIOScheduler) -> None:
    log.info("[Jobs] Starting bot check job (hourly)")
    scheduler.add_job(
        _scheduled,
        trigger=CronTrigger(minute=20, timezone=UTC),
        id=JOB_NAME,
        replace_existing=True,
        # Also check soon after start: the host sleeps when idle
        next_run_time=datetime.now(UTC) + timedelta(minutes=2),
    )
