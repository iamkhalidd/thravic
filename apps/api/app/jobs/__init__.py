"""Job wiring — port of `jobs/index.ts`.

`init_jobs()` starts the scheduler and registers the hourly traffic alert, the
hourly usage-limit and renewal-reminder emails and the daily retention job (see `jobs/runner.py`
for how they are scheduled).
Collection is written to Postgres in the request, so there is no background
event drainer and nothing here touches Redis.
"""

from __future__ import annotations

from datetime import UTC

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from ..logging import create_logger
from .retention import start_retention_job
from .subscription_reminders import start_subscription_reminder_job
from .traffic_alert import start_traffic_alert_job
from .usage_alerts import start_usage_alert_job

log = create_logger("Jobs")

__all__ = [
    "init_jobs",
    "shutdown_jobs",
]


def init_jobs() -> AsyncIOScheduler:
    """Schedule the recurring jobs and start the scheduler."""
    log.info("[Jobs] Initializing scheduled jobs...")

    scheduler = AsyncIOScheduler(timezone=UTC)
    start_traffic_alert_job(scheduler)
    start_retention_job(scheduler)
    start_usage_alert_job(scheduler)
    start_subscription_reminder_job(scheduler)
    scheduler.start()

    log.info("[Jobs] All jobs scheduled.")
    return scheduler


def shutdown_jobs(scheduler: AsyncIOScheduler | None) -> None:
    """Stop the scheduler. `node-cron` needs no equivalent because the process exits."""
    if scheduler is None:
        return
    try:
        scheduler.shutdown(wait=False)
    except Exception as exc:  # noqa: BLE001 — never block shutdown
        log.error(f"Failed to stop scheduler: {exc}")
