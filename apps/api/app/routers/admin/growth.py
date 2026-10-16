"""Growth views: where new accounts drop off, who stopped paying, who is stuck.

- funnel: of the accounts that signed up in the window, how many added a site,
  how many of those sites sent a first event, and how many paid.
- churn: paid plans whose period (plus the grace days) ran out this month in the
  report time zone without a renewal.
- stuck: accounts older than two days that have not added a site, or whose sites
  have never sent an event. These are the people to email.

"Sent an event" is checked per site with LIMIT 1 so it uses the
(domain_id, created_at) index instead of counting events.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from ...db import query, query_one
from ...json_response import jsjson
from ...services import revenue_service
from ...services.plan_service import GRACE_DAYS, entitled

router = APIRouter()

STUCK_AFTER_DAYS = 2
STUCK_LIMIT = 50

_HAS_EVENT = """
EXISTS (
    SELECT 1 FROM domains d
    CROSS JOIN LATERAL (SELECT 1 FROM events e WHERE e.domain_id = d.id LIMIT 1) ev
    WHERE d.user_id = u.id
)
"""


@router.get("")
@router.get("/")
async def growth(request: Request):
    try:
        days = max(7, min(365, int(request.query_params.get("days") or 90)))
    except ValueError:
        days = 90
    tz = revenue_service.report_tz_name()

    funnel = await query_one(
        f"""
        WITH cohort AS (
            SELECT u.id,
                   EXISTS (SELECT 1 FROM domains d WHERE d.user_id = u.id) AS has_domain,
                   {_HAS_EVENT} AS has_event,
                   EXISTS (SELECT 1 FROM payment_history ph
                           WHERE ph.user_id = u.id AND ph.status = 'success') AS paid
            FROM users u
            WHERE u.created_at >= NOW() - INTERVAL '1 day' * $1::int
              AND COALESCE(u.role, 'user') = 'user'
        )
        SELECT COUNT(*) AS signed_up,
               COUNT(*) FILTER (WHERE has_domain) AS added_domain,
               COUNT(*) FILTER (WHERE has_event) AS first_event,
               COUNT(*) FILTER (WHERE paid) AS paid
        FROM cohort
        """,
        days,
    ) or {}

    churned = await query(
        f"""
        SELECT s.user_id, u.email, u.name, s.plan,
               s.current_period_end + INTERVAL '{GRACE_DAYS} days' AS lapsed_at
        FROM subscriptions s
        JOIN users u ON u.id = s.user_id
        WHERE s.plan <> 'free'
          AND s.current_period_end IS NOT NULL
          AND NOT ({entitled('s')})
          AND s.current_period_end + INTERVAL '{GRACE_DAYS} days'
              >= date_trunc('month', NOW() AT TIME ZONE $1) AT TIME ZONE $1
        ORDER BY lapsed_at DESC
        """,
        tz,
    )
    paying = await query_one(
        f"SELECT COUNT(*) AS count FROM subscriptions s WHERE {entitled('s')} AND s.plan <> 'free'"
    )
    paying_now = int((paying or {}).get("count") or 0)
    churn_rate = round(len(churned) / (paying_now + len(churned)) * 100, 1) if churned else 0.0

    stuck = await query(
        f"""
        SELECT u.id, u.email, u.name, u.created_at,
               CASE WHEN NOT EXISTS (SELECT 1 FROM domains d WHERE d.user_id = u.id)
                    THEN 'no_domain' ELSE 'no_events' END AS stage
        FROM users u
        WHERE COALESCE(u.role, 'user') = 'user'
          AND u.created_at <= NOW() - INTERVAL '{STUCK_AFTER_DAYS} days'
          AND NOT {_HAS_EVENT}
        ORDER BY u.created_at DESC
        LIMIT {STUCK_LIMIT}
        """
    )

    return jsjson(
        {
            "days": days,
            "funnel": {
                "signedUp": int(funnel.get("signed_up") or 0),
                "addedDomain": int(funnel.get("added_domain") or 0),
                "firstEvent": int(funnel.get("first_event") or 0),
                "paid": int(funnel.get("paid") or 0),
            },
            "churn": {"count": len(churned), "rate": churn_rate, "accounts": churned},
            "stuck": stuck,
            "timezone": tz,
        }
    )
