"""Nightly visitor models: refit each site's conversion and churn models
(see `visitor_score_service`).

Due once per UTC day, checked at 50 past the hour so it runs after the hour's
bot check (20 past) has moved bot visits out of the training data.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..db import query
from ..logging import create_logger
from ..services import visitor_score_service
from .bot_check import SITES_QUERY
from .runner import run_if_due

log = create_logger("Job")

JOB_NAME = "visitor_models"


async def fit_sites() -> dict[str, Any]:
    fitted = trained = failed = 0
    for site in await query(SITES_QUERY):
        try:
            result = await visitor_score_service.fit_domain(site)
            fitted += 1
            trained += 1 if result["trained"] else 0
        except Exception as exc:  # noqa: BLE001 — one site must not stop the rest
            log.error(f"[Jobs] Visitor models for {site['domain']} failed: {exc}")
            failed += 1
    return {"fitted": fitted, "conversionModels": trained, "failed": failed}


async def _scheduled() -> None:
    # Due once per UTC day: anything that ran since midnight counts
    now = datetime.now(UTC)
    since_midnight = now - now.replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        await run_if_due(JOB_NAME, since_midnight, fit_sites)
    except Exception as exc:  # noqa: BLE001 — a failed run must not stop the schedule
        log.error(f"[Jobs] Visitor models failed: {exc}")


def start_visitor_models_job(scheduler: AsyncIOScheduler) -> None:
    log.info("[Jobs] Starting visitor models job (daily)")
    scheduler.add_job(
        _scheduled,
        trigger=CronTrigger(minute=50, timezone=UTC),
        id=JOB_NAME,
        replace_existing=True,
        # Also check soon after start: the host sleeps when idle
        next_run_time=datetime.now(UTC) + timedelta(minutes=5),
    )
