"""Email owners a week before their paid period ends.

Payments are one-off (no automatic renewal), so this email is how owners find
out the plan is ending. Each reminder is sent once per period: it is claimed in
`subscription_notices` keyed by the period's end, so a renewal (a new end) gets
its own reminder, and the claim is released if delivery fails so the next run
tries again.
"""

from __future__ import annotations

from datetime import UTC, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..db import query
from ..logging import create_logger
from ..services import plan_catalog
from ..services.email_service import send_renewal_reminder_email
from ..services.plan_service import GRACE_DAYS
from .runner import run_if_due

log = create_logger("Job")

JOB_NAME = "subscription_reminders"
RUN_EVERY = timedelta(minutes=55)
REMIND_DAYS_BEFORE = 7
KIND = "renew_7d"

DUE_QUERY = """
SELECT s.user_id, s.plan, s.current_period_end, u.email, u.name
FROM subscriptions s
JOIN users u ON u.id = s.user_id
WHERE s.status = 'active'
  AND s.plan <> 'free'
  AND s.current_period_end > NOW()
  AND s.current_period_end <= NOW() + make_interval(days => $1)
  AND COALESCE(u.role, 'user') <> 'suspended'
"""


async def send_renewal_reminders() -> dict[str, Any]:
    sent = failed = 0
    for row in await query(DUE_QUERY, REMIND_DAYS_BEFORE):
        claimed = await query(
            """
            INSERT INTO subscription_notices (user_id, period_end, kind)
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
            RETURNING kind
            """,
            row["user_id"],
            row["current_period_end"],
            KIND,
        )
        if not claimed:
            continue

        plan = await plan_catalog.get(row["plan"])
        try:
            await send_renewal_reminder_email(
                row["email"], row["name"], plan.name, row["current_period_end"], GRACE_DAYS
            )
            sent += 1
        except Exception as exc:  # noqa: BLE001 — release the claim and retry next run
            failed += 1
            log.error(f"[Jobs] Renewal reminder to {row['email']} failed: {exc}")
            await query(
                "DELETE FROM subscription_notices "
                "WHERE user_id = $1 AND period_end = $2 AND kind = $3",
                row["user_id"],
                row["current_period_end"],
                KIND,
            )

    return {"sent": sent, "failed": failed}


async def _scheduled_reminders() -> None:
    try:
        await run_if_due(JOB_NAME, RUN_EVERY, send_renewal_reminders)
    except Exception as exc:  # noqa: BLE001 — a failed run must not stop the schedule
        log.error(f"[Jobs] Renewal reminders failed: {exc}")


def start_subscription_reminder_job(scheduler: AsyncIOScheduler) -> None:
    log.info("[Jobs] Starting renewal reminder job (hourly)")
    scheduler.add_job(
        _scheduled_reminders,
        trigger=CronTrigger(minute=17, timezone=UTC),
        id=JOB_NAME,
        replace_existing=True,
    )
