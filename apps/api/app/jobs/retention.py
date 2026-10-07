"""Daily data retention — dry run by default.

Plans promise 30-day / 1-year / 2-year history, but expired data was only removed
when an admin pressed "cleanup". This job applies the same policies daily.

`RETENTION_MODE` decides what it does, because deletion is irreversible:

* `dry_run` (default) — counts what is past retention and records it in the admin
  audit log (`retention.dry_run`) and `job_runs`; deletes nothing. Review a few of
  these, especially `fromInactivePaidOwners`, before switching to `delete`.
* `delete` — removes it in batches and records `retention.cleanup`.
* `off` — does not run.
"""

from __future__ import annotations

from datetime import UTC, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..config import get_settings
from ..logging import create_logger
from ..services import retention_service
from ..services.audit_service import log_action
from .runner import run_if_due

log = create_logger("Job")

JOB_NAME = "retention"
RUN_EVERY = timedelta(hours=23)
MODES = ("dry_run", "delete", "off")


async def apply_retention(mode: str) -> dict[str, Any]:
    """One retention pass in `mode`; returns what it found or deleted."""
    if mode == "delete":
        deleted = await retention_service.delete_expired()
        await log_action(
            admin_id=None, action="retention.cleanup", target_type="system",
            details={"mode": mode, "deleted": deleted},
        )
        log.info(f"[Jobs] Retention deleted {deleted}")
        return {"mode": mode, "deleted": deleted}

    report = await retention_service.expired_counts()
    await log_action(
        admin_id=None, action="retention.dry_run", target_type="system",
        details={"mode": mode, **report},
    )
    log.info(f"[Jobs] Retention dry run, nothing deleted: {report}")
    return {"mode": mode, **report}


async def _scheduled_retention() -> None:
    mode = get_settings().RETENTION_MODE.strip().lower()
    if mode not in MODES:
        log.error(f"[Jobs] RETENTION_MODE={mode!r} is not one of {MODES}; skipping")
        return
    if mode == "off":
        return
    try:
        await run_if_due(JOB_NAME, RUN_EVERY, lambda: apply_retention(mode))
    except Exception as exc:  # noqa: BLE001 — a failed run must not stop the schedule
        log.error(f"[Jobs] Retention failed: {exc}")


def start_retention_job(scheduler: AsyncIOScheduler) -> None:
    """Check hourly; the run itself happens at most once per RUN_EVERY (see runner)."""
    log.info(f"[Jobs] Starting retention job (mode: {get_settings().RETENTION_MODE})")
    scheduler.add_job(
        _scheduled_retention,
        trigger=CronTrigger(minute=17, timezone=UTC),
        id=JOB_NAME,
        replace_existing=True,
    )
