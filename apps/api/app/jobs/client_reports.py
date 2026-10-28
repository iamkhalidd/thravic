"""Monthly white-label client reports (Reports → Client reports, Agency plan).

Every hour from the 1st of the month, each site with client reports on gets last
month's report emailed to its client recipients. A site's month is claimed in
`client_report_settings.last_period_key` before sending and the claim is
released if delivery fails, so the next hourly run tries again and an overlapping
run cannot send it twice. Sites whose owner is no longer on a plan with client
reports are skipped (their settings stay, ready for when they come back).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..config import get_settings
from ..db import query, query_one
from ..logging import create_logger
from ..services import client_report_service, plan_service
from ..services.agency_service import REPORT_FEATURE
from .runner import run_if_due

log = create_logger("Job")

JOB_NAME = "client_reports"
RUN_EVERY = timedelta(minutes=55)

DUE_QUERY = """
SELECT d.id, d.domain, d.name, d.user_id, s.recipients
FROM client_report_settings s
JOIN domains d ON d.id = s.domain_id
JOIN users u ON u.id = d.user_id
WHERE s.enabled AND cardinality(s.recipients) > 0
  AND s.last_period_key IS DISTINCT FROM $1
  AND COALESCE(u.role, 'user') <> 'suspended'
  AND u.restricted_at IS NULL
ORDER BY d.created_at
"""

CLAIM = """
UPDATE client_report_settings SET last_period_key = $2
WHERE domain_id = $1 AND last_period_key IS DISTINCT FROM $2
RETURNING last_period_key
"""

RELEASE = """
UPDATE client_report_settings SET last_period_key = $3
WHERE domain_id = $1 AND last_period_key = $2
RETURNING 1
"""


async def send_client_reports(now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    key = client_report_service.previous_month(now)
    sent = skipped = failed = 0
    plans: dict[str, bool] = {}
    for site in await query(DUE_QUERY, key):
        owner = str(site["user_id"])
        if owner not in plans:
            plans[owner] = REPORT_FEATURE in (await plan_service.for_user(owner)).features
        if not plans[owner]:
            skipped += 1
            continue
        before = await query_one(
            "SELECT last_period_key FROM client_report_settings WHERE domain_id = $1", site["id"]
        )
        if not await query_one(CLAIM, site["id"], key):
            continue  # another run has it
        try:
            data = await client_report_service.build(site, key)
            await client_report_service.deliver(
                site,
                data,
                list(site["recipients"]),
                "monthly",
                get_settings().api_public_url,
            )
            sent += 1
        except Exception as exc:  # noqa: BLE001 — release, try again next hour
            failed += 1
            log.error(f"[Jobs] Client report for {site['domain']} ({key}) failed: {exc}")
            await query(RELEASE, site["id"], key, (before or {}).get("last_period_key"))
    if sent or failed:
        log.info(f"[Jobs] Client reports {key}: {sent} sent, {skipped} skipped, {failed} failed")
    return {"month": key, "sent": sent, "skipped": skipped, "failed": failed}


async def _scheduled_reports() -> None:
    try:
        await run_if_due(JOB_NAME, RUN_EVERY, send_client_reports)
    except Exception as exc:  # noqa: BLE001 — a failed run must not stop the schedule
        log.error(f"[Jobs] Client reports failed: {exc}")


def start_client_report_job(scheduler: AsyncIOScheduler) -> None:
    log.info("[Jobs] Starting client report job (hourly, sends from the 1st)")
    scheduler.add_job(
        _scheduled_reports,
        trigger=CronTrigger(minute=37, timezone=UTC),
        id=JOB_NAME,
        replace_existing=True,
    )
