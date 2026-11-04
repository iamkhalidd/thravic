"""Daily anomaly scan: what was unusual yesterday on each site (see `anomaly_service`).

Once per UTC day, at the first hourly tick after midnight, every site of an
active account is scanned for the day that just ended. AI insights and the
hourly smart alerts read what it stored.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..db import query
from ..logging import create_logger
from ..services import anomaly_service
from .runner import run_if_due

log = create_logger("Job")

JOB_NAME = "anomaly_scan"

SITES_QUERY = """
SELECT d.id, d.domain
FROM domains d
JOIN users u ON u.id = d.user_id
WHERE COALESCE(u.role, 'user') <> 'suspended'
  AND u.restricted_at IS NULL
ORDER BY d.domain
"""


async def scan_sites() -> dict[str, Any]:
    today = datetime.now(UTC).date()
    day = today - timedelta(days=1)
    await anomaly_service.remove_old(today)

    scanned = found = failed = 0
    for site in await query(SITES_QUERY):
        try:
            found += len(await anomaly_service.scan_domain(str(site["id"]), day))
            scanned += 1
        except Exception as exc:  # noqa: BLE001 — one site must not stop the rest
            log.error(f"[Jobs] Anomaly scan for {site['domain']} failed: {exc}")
            failed += 1
    return {"day": str(day), "scanned": scanned, "found": found, "failed": failed}


async def _scheduled() -> None:
    # Due once per UTC day: anything that ran since midnight counts
    now = datetime.now(UTC)
    since_midnight = now - now.replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        await run_if_due(JOB_NAME, since_midnight, scan_sites)
    except Exception as exc:  # noqa: BLE001 — a failed run must not stop the schedule
        log.error(f"[Jobs] Anomaly scan failed: {exc}")


def start_anomaly_scan_job(scheduler: AsyncIOScheduler) -> None:
    log.info("[Jobs] Starting anomaly scan job (daily)")
    scheduler.add_job(
        _scheduled,
        trigger=CronTrigger(minute=35, timezone=UTC),
        id=JOB_NAME,
        replace_existing=True,
        # Also check soon after start: the host sleeps when idle
        next_run_time=datetime.now(UTC) + timedelta(minutes=3),
    )
