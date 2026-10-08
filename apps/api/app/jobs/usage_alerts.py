"""Email account owners when their events reach 80% and 100% of the plan.

At the limit the collector stops storing events (plan_service.over_event_limit),
so owners must hear about it from us, not from a gap in their charts. Usage is
counted over each owner's own allowance window (`plan_service.usage_window`:
the paid plan's 30-day cycle, else the calendar month). Each threshold is emailed
once per user per window: sending is claimed in `limit_notifications` (its
`month` column holds the window's start date) first, and the claim is released
if delivery fails so the next run tries again.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..db import query
from ..logging import create_logger
from ..services import plan_catalog
from ..services.email_service import send_usage_limit_email
from ..services.plan_service import entitled, usage_window
from .runner import run_if_due

log = create_logger("Job")

JOB_NAME = "usage_alerts"
RUN_EVERY = timedelta(minutes=55)
THRESHOLDS = (80, 100)

# Every owner with a site, their plan (latest entitled subscription, else free)
# and, for a paid plan, the start its allowance cycles count from.
OWNERS_QUERY = f"""
SELECT u.id, u.email, u.name,
       COALESCE(LOWER(s.plan), 'free') AS plan,
       CASE WHEN LOWER(s.plan) <> 'free' THEN s.current_period_start END AS anchor
FROM users u
LEFT JOIN LATERAL (
    SELECT plan, current_period_start FROM subscriptions
    WHERE user_id = u.id AND {entitled()}
    ORDER BY created_at DESC LIMIT 1
) s ON TRUE
WHERE COALESCE(u.role, 'user') <> 'suspended'
  AND EXISTS (SELECT 1 FROM domains d WHERE d.user_id = u.id)
"""

# Events per owner since the start of that owner's window.
USAGE_QUERY = """
SELECT w.user_id, COUNT(*)::int AS used
FROM unnest($1::uuid[], $2::timestamptz[]) AS w(user_id, since)
JOIN domains d ON d.user_id = w.user_id
JOIN events e ON e.domain_id = d.id AND e.created_at >= w.since
GROUP BY w.user_id
"""


async def send_usage_alerts() -> dict[str, Any]:
    now = datetime.now(UTC)
    owners = await query(OWNERS_QUERY)
    windows = {str(o["id"]): usage_window(o["anchor"], now) for o in owners}
    used = {
        str(r["user_id"]): r["used"]
        for r in await query(
            USAGE_QUERY,
            [o["id"] for o in owners],
            [windows[str(o["id"])][0] for o in owners],
        )
    }

    rows = []
    for owner in owners:
        plan = await plan_catalog.get(owner["plan"])
        count = used.get(str(owner["id"]), 0)
        if plan.events_limit and count * 100 >= min(THRESHOLDS) * plan.events_limit:
            start, resets_at = windows[str(owner["id"])]
            rows.append(
                {
                    **owner,
                    "used": count,
                    "plan": plan.name,
                    "events_limit": plan.events_limit,
                    "window": start.date(),
                    "resets_at": resets_at,
                }
            )

    sent: dict[int, int] = {threshold: 0 for threshold in THRESHOLDS}
    failed = 0
    for row in rows:
        used_now, limit = row["used"], row["events_limit"]
        reached = [t for t in THRESHOLDS if used_now * 100 >= t * limit]

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
            row["window"],
            reached,
        )
        if not claimed:
            continue

        threshold = max(c["threshold"] for c in claimed)
        try:
            await send_usage_limit_email(
                row["email"], row["name"], threshold, used_now, limit, row["plan"], row["resets_at"]
            )
            sent[threshold] += 1
        except Exception as exc:  # noqa: BLE001 — release the claim and retry next run
            failed += 1
            log.error(f"[Jobs] Usage alert to {row['email']} failed: {exc}")
            await query(
                "DELETE FROM limit_notifications "
                "WHERE user_id = $1 AND month = $2 AND threshold = ANY($3::smallint[])",
                row["id"],
                row["window"],
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
