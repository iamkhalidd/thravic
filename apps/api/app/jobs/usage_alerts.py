"""Email account owners when their monthly events reach 80% and 100% of the plan.

At the limit the collector stops storing events (plan_service.over_event_limit),
so owners must hear about it from us, not from a gap in their charts. Each
threshold is emailed once per user per calendar month (UTC): sending is claimed in
`limit_notifications` first, and the claim is released if delivery fails so the
next run tries again.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..db import query
from ..logging import create_logger
from ..plans import PLAN_LIMITS
from ..services.email_service import send_usage_limit_email
from .runner import run_if_due

log = create_logger("Job")

JOB_NAME = "usage_alerts"
RUN_EVERY = timedelta(minutes=55)
THRESHOLDS = (80, 100)

# Owners at or above the lowest threshold this month. The plan and limit follow
# plan_service.for_user: the latest active subscription, else the free plan.
USAGE_QUERY = """
WITH usage AS (
    SELECT d.user_id, COUNT(*)::int AS used
    FROM events e
    JOIN domains d ON d.id = e.domain_id
    WHERE e.created_at >= $1
    GROUP BY d.user_id
)
SELECT u.id, u.email, u.name, usage.used,
       COALESCE(LOWER(s.plan), 'free') AS plan,
       COALESCE(NULLIF(s.events_limit, 0), $2)::int AS events_limit
FROM usage
JOIN users u ON u.id = usage.user_id
LEFT JOIN LATERAL (
    SELECT plan, events_limit FROM subscriptions
    WHERE user_id = u.id AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
) s ON TRUE
WHERE COALESCE(u.role, 'user') <> 'suspended'
  AND usage.used * 100 >= $3 * COALESCE(NULLIF(s.events_limit, 0), $2)
"""


def _month_start(now: datetime) -> date:
    return date(now.year, now.month, 1)


async def send_usage_alerts() -> dict[str, Any]:
    now = datetime.now(UTC)
    month = _month_start(now)
    rows = await query(
        USAGE_QUERY,
        datetime(now.year, now.month, 1, tzinfo=UTC),
        int(PLAN_LIMITS["free"]["eventsLimit"]),
        min(THRESHOLDS),
    )

    sent: dict[int, int] = {threshold: 0 for threshold in THRESHOLDS}
    failed = 0
    for row in rows:
        used, limit = row["used"], row["events_limit"]
        reached = [t for t in THRESHOLDS if used * 100 >= t * limit]

        # Claim every threshold reached; only the ones newly claimed are news. A
        # user who jumps straight past 100% gets the 100% email, not both.
        claimed = await query(
            """
            INSERT INTO limit_notifications (user_id, month, threshold)
            SELECT $1, $2, t FROM unnest($3::smallint[]) AS t
            ON CONFLICT DO NOTHING
            RETURNING threshold
            """,
            row["id"],
            month,
            reached,
        )
        if not claimed:
            continue

        threshold = max(c["threshold"] for c in claimed)
        try:
            await send_usage_limit_email(
                row["email"], row["name"], threshold, used, limit, row["plan"]
            )
            sent[threshold] += 1
        except Exception as exc:  # noqa: BLE001 — release the claim and retry next run
            failed += 1
            log.error(f"[Jobs] Usage alert to {row['email']} failed: {exc}")
            await query(
                "DELETE FROM limit_notifications "
                "WHERE user_id = $1 AND month = $2 AND threshold = ANY($3::smallint[])",
                row["id"],
                month,
                [c["threshold"] for c in claimed],
            )

    return {"candidates": len(rows), "sent": sent, "failed": failed}


async def _scheduled_alerts() -> None:
    try:
        await run_if_due(JOB_NAME, RUN_EVERY, send_usage_alerts)
    except Exception as exc:  # noqa: BLE001 — a failed run must not stop the schedule
        log.error(f"[Jobs] Usage alerts failed: {exc}")


def start_usage_alert_job(scheduler: AsyncIOScheduler) -> None:
    log.info("[Jobs] Starting usage alert job (hourly)")
    scheduler.add_job(
        _scheduled_alerts,
        trigger=CronTrigger(minute=7, timezone=UTC),
        id=JOB_NAME,
        replace_existing=True,
    )
