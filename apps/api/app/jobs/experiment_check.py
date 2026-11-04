"""Daily A/B test check: refresh each running test's results and note when one
first has a winner (see `experiment_service`). The hourly smart alerts tell the
owner.

Due once per UTC day, checked at 35 past the hour.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..db import query
from ..logging import create_logger
from ..services import experiment_service
from .runner import run_if_due

log = create_logger("Job")

JOB_NAME = "experiment_check"


async def check_sites() -> dict[str, Any]:
    checked = decided = failed = 0
    sites = await query(
        "SELECT DISTINCT e.domain_id, d.domain FROM experiments e "
        "JOIN domains d ON d.id = e.domain_id WHERE e.status = 'active'"
    )
    for site in sites:
        try:
            result = await experiment_service.check_domain(site["domain_id"])
            checked += result["checked"]
            decided += result["decided"]
        except Exception as exc:  # noqa: BLE001 — one site must not stop the rest
            log.error(f"[Jobs] Experiment check for {site['domain']} failed: {exc}")
            failed += 1
    return {"experiments": checked, "winners": decided, "failed": failed}


async def _scheduled() -> None:
    # Due once per UTC day: anything that ran since midnight counts
    now = datetime.now(UTC)
    since_midnight = now - now.replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        await run_if_due(JOB_NAME, since_midnight, check_sites)
    except Exception as exc:  # noqa: BLE001 — a failed run must not stop the schedule
        log.error(f"[Jobs] Experiment check failed: {exc}")


def start_experiment_check_job(scheduler: AsyncIOScheduler) -> None:
    log.info("[Jobs] Starting experiment check job (daily)")
    scheduler.add_job(
        _scheduled,
        trigger=CronTrigger(minute=35, timezone=UTC),
        id=JOB_NAME,
        replace_existing=True,
        # Also check soon after start: the host sleeps when idle
        next_run_time=datetime.now(UTC) + timedelta(minutes=5),
    )
