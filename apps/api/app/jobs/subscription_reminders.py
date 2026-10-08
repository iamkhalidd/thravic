"""Email owners as their paid period ends: a week before, the day before, when
grace starts, and when the account falls back to the free plan.

Payments are one-off (no automatic renewal), so these emails are how owners find
out. Each run sends at most one email per subscription: the one for the stage it
is in now, so an owner who is already a day from the end gets "tomorrow" and not
also "in a week". Each stage is sent once per period: it is claimed in
`subscription_notices` keyed by the period's end, so a renewal (a new end) starts
over, and the claim is released if delivery fails so the next run tries again.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..db import query, query_one
from ..logging import create_logger
from ..services import plan_catalog
from ..services.email_service import send_subscription_notice_email
from ..services.plan_service import FREE_PLAN, GRACE_DAYS, LAPSED_RETENTION_HOLD_DAYS
from .runner import run_if_due

log = create_logger("Job")

JOB_NAME = "subscription_reminders"
RUN_EVERY = timedelta(minutes=55)
REMIND_DAYS_BEFORE = 7
# A "moved to free" email is only sent this soon after it happened, so an
# account that lapsed long ago (or before this job existed) is not emailed now.
DOWNGRADE_NOTICE_WINDOW_DAYS = 7

DUE_QUERY = """
SELECT s.user_id, s.plan, s.current_period_end, u.email, u.name,
       (SELECT COUNT(*)::int FROM domains d WHERE d.user_id = s.user_id) AS sites
FROM subscriptions s
JOIN users u ON u.id = s.user_id
WHERE s.status = 'active'
  AND s.plan <> 'free'
  AND s.current_period_end <= NOW() + make_interval(days => $1)
  AND s.current_period_end > NOW() - make_interval(days => $2)
  AND COALESCE(u.role, 'user') <> 'suspended'
"""


def stage(period_end: datetime, now: datetime) -> str:
    """Which notice a period ending at `period_end` is due for at `now`."""
    if period_end > now + timedelta(days=1):
        return "renew_7d"
    if period_end > now:
        return "renew_1d"
    if period_end + timedelta(days=GRACE_DAYS) > now:
        return "grace_started"
    return "downgraded"


async def send_subscription_notices() -> dict[str, Any]:
    now = datetime.now(UTC)
    free = await plan_catalog.get(FREE_PLAN)
    sent: dict[str, int] = {}
    failed = 0
    rows = await query(DUE_QUERY, REMIND_DAYS_BEFORE, GRACE_DAYS + DOWNGRADE_NOTICE_WINDOW_DAYS)

    for row in rows:
        kind = stage(row["current_period_end"], now)
        claimed = await query_one(
            """
            INSERT INTO subscription_notices (user_id, period_end, kind)
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
            RETURNING kind
            """,
            row["user_id"],
            row["current_period_end"],
            kind,
        )
        if not claimed:
            continue

        plan = await plan_catalog.get(row["plan"])
        try:
            await send_subscription_notice_email(
                row["email"],
                row["name"],
                kind,
                plan_name=plan.name,
                period_end=row["current_period_end"],
                grace_days=GRACE_DAYS,
                free_plan_name=free.name,
                free_sites=free.domains_limit,
                paused_sites=max(0, row["sites"] - free.domains_limit),
                data_hold_days=LAPSED_RETENTION_HOLD_DAYS,
            )
            sent[kind] = sent.get(kind, 0) + 1
        except Exception as exc:  # noqa: BLE001 — release the claim and retry next run
            failed += 1
            log.error(f"[Jobs] {kind} email to {row['email']} failed: {exc}")
            await query(
                "DELETE FROM subscription_notices "
                "WHERE user_id = $1 AND period_end = $2 AND kind = $3",
                row["user_id"],
                row["current_period_end"],
                kind,
            )

    return {"candidates": len(rows), "sent": sent, "failed": failed}


async def _scheduled_notices() -> None:
    try:
        await run_if_due(JOB_NAME, RUN_EVERY, send_subscription_notices)
    except Exception as exc:  # noqa: BLE001 — a failed run must not stop the schedule
        log.error(f"[Jobs] Subscription notices failed: {exc}")


def start_subscription_reminder_job(scheduler: AsyncIOScheduler) -> None:
    log.info("[Jobs] Starting subscription notice job (hourly)")
    scheduler.add_job(
        _scheduled_notices,
        trigger=CronTrigger(minute=17, timezone=UTC),
        id=JOB_NAME,
        replace_existing=True,
    )
