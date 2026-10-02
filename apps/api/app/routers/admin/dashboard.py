"""Admin dashboard — port of `routes/admin/dashboard.ts` (3 handlers)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from ...db import query, query_one
from ...errors import SimpleError
from ...js_compat import js_parse_int_or_nan, js_to_locale_string
from ...json_response import jsjson
from ...logging import create_logger

log = create_logger("Admin:Dashboard")

router = APIRouter()


def _count(row: dict[str, Any] | None) -> int:
    """`parseInt(x?.count || '0')` — the int8 codec hands back a string."""
    return int((row or {}).get("count") or 0)


@router.get("/stats")
@router.get("/stats/")
async def stats():
    try:
        users_count = await query_one("SELECT COUNT(*) as count FROM users")
        domains_count = await query_one("SELECT COUNT(*) as count FROM domains")
        events_today = await query_one(
            "SELECT COUNT(*) as count FROM events WHERE created_at >= CURRENT_DATE"
        )
        active_subscriptions = await query_one(
            """
            SELECT COUNT(*) as count FROM subscriptions
            WHERE status = 'active' AND plan != 'free'
            """
        )
        recent_signups = await query(
            """
            SELECT id, name, email, subscription, role, created_at
            FROM users ORDER BY created_at DESC LIMIT 10
            """
        )

        # MRR is read from the plans table so pricing changes apply immediately.
        mrr_row = await query_one(
            """
            SELECT COALESCE(SUM(p.price), 0) as total
            FROM subscriptions s
            JOIN plans p ON p.id = s.plan
            WHERE s.status = 'active' AND s.plan != 'free'
            """
        )

        plan_distribution = await query(
            """
            SELECT subscription as plan, COUNT(*) as count
            FROM users GROUP BY subscription ORDER BY count DESC
            """
        )

        top_domains = await query(
            """
            SELECT d.domain, d.name, u.email as owner, COUNT(e.id) as events_count
            FROM domains d
            LEFT JOIN events e ON e.domain_id = d.id AND e.created_at >= NOW() - INTERVAL '30 days'
            LEFT JOIN users u ON d.user_id = u.id
            GROUP BY d.id, d.domain, d.name, u.email
            ORDER BY events_count DESC
            LIMIT 10
            """
        )

        # `parseFloat(... || '0')`; jsjson normalises an integral float back to an
        # integer, which is what JS would emit for `45000`.
        mrr = float((mrr_row or {}).get("total") or "0")

        return jsjson(
            {
                "stats": {
                    "totalUsers": _count(users_count),
                    "totalDomains": _count(domains_count),
                    "eventsToday": _count(events_today),
                    "paidSubscriptions": _count(active_subscriptions),
                    "mrr": mrr,
                },
                "planDistribution": plan_distribution,
                "topDomains": top_domains,
                "recentSignups": recent_signups,
            }
        )
    except Exception as exc:  # noqa: BLE001
        log.error(f"Dashboard stats error: {exc}")
        raise SimpleError("Failed to load dashboard stats", 500) from None


@router.get("/charts")
@router.get("/charts/")
async def charts(request: Request):
    try:
        # No fallback in the source, and the value goes straight into
        # `INTERVAL '1 day' * $1`, so `?days=abc` is NaN and Postgres rejects it —
        # a 500, not an empty chart. `js_parse_int` would have quietly used 0.
        days = js_parse_int_or_nan(request.query_params.get("days") or "30")

        signups = await query(
            """
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM users
            WHERE created_at >= NOW() - INTERVAL '1 day' * $1::int
            GROUP BY DATE(created_at) ORDER BY date
            """,
            days,
        )

        events = await query(
            """
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM events
            WHERE created_at >= NOW() - INTERVAL '1 day' * $1::int
            GROUP BY DATE(created_at) ORDER BY date
            """,
            days,
        )

        sessions = await query(
            """
            SELECT DATE(started_at) as date, COUNT(*) as count
            FROM sessions
            WHERE started_at >= NOW() - INTERVAL '1 day' * $1::int
            GROUP BY DATE(started_at) ORDER BY date
            """,
            days,
        )

        return jsjson({"signups": signups, "events": events, "sessions": sessions})
    except Exception as exc:  # noqa: BLE001
        log.error(f"Dashboard charts error: {exc}")
        raise SimpleError("Failed to load chart data", 500) from None


@router.get("/actions")
@router.get("/actions/")
async def actions():
    try:
        at_limit = await query_one(
            """
            SELECT COUNT(*) as count FROM subscriptions s
            WHERE s.status = 'active'
              AND s.events_limit > 0
              AND (s.events_used::float / s.events_limit::float) >= 0.85
              AND s.events_used < s.events_limit
            """
        )

        over_limit = await query_one(
            """
            SELECT COUNT(*) as count FROM subscriptions s
            WHERE s.status = 'active'
              AND s.events_limit > 0
              AND s.events_used >= s.events_limit
            """
        )

        inactive_users = await query_one(
            """
            SELECT COUNT(DISTINCT u.id) as count
            FROM users u
            JOIN domains d ON d.user_id = u.id
            WHERE u.created_at <= NOW() - INTERVAL '3 days'
              AND NOT EXISTS (
                  SELECT 1 FROM events e
                  WHERE e.domain_id = d.id
                    AND e.created_at >= NOW() - INTERVAL '14 days'
              )
            """
        )

        failed_payments = await query_one(
            """
            SELECT COUNT(*) as count FROM subscriptions
            WHERE status IN ('past_due', 'unpaid')
            """
        )

        recent_upgrades = await query_one(
            """
            SELECT COUNT(*) as count, COALESCE(SUM(p.price), 0) as mrr
            FROM subscriptions s
            JOIN plans p ON p.id = s.plan
            WHERE s.status = 'active'
              AND s.plan != 'free'
              AND s.created_at >= NOW() - INTERVAL '7 days'
            """
        )

        over_count = _count(over_limit)
        at_count = _count(at_limit)
        inactive = _count(inactive_users)
        failed = _count(failed_payments)
        upgraded = _count(recent_upgrades)
        new_mrr = float((recent_upgrades or {}).get("mrr") or "0")

        feed: list[dict[str, Any]] = []

        # Order matters: the feed is rendered as-is by the admin UI.
        if over_count > 0:
            feed.append(
                {
                    "type": "limit_exceeded",
                    "severity": "critical",
                    "title": (
                        f"{over_count} user"
                        f"{'s have' if over_count > 1 else ' has'} "
                        "exceeded their event limit"
                    ),
                    "detail": (
                        "They are likely seeing errors. Consider reaching out or "
                        "upgrading their plan."
                    ),
                    "count": over_count,
                    "link": "/subscriptions?status=active",
                }
            )

        if failed > 0:
            feed.append(
                {
                    "type": "failed_payments",
                    "severity": "critical",
                    "title": f"{failed} failed payment{'' if failed <= 1 else 's'}",
                    "detail": (
                        "Subscriptions in past_due or unpaid state. Revenue at risk."
                    ),
                    "count": failed,
                    "link": "/subscriptions?status=past_due",
                }
            )

        if at_count > 0:
            feed.append(
                {
                    "type": "limit_warning",
                    "severity": "warning",
                    "title": (
                        f"{at_count} user"
                        f"{'s are' if at_count > 1 else ' is'} "
                        "approaching their event limit"
                    ),
                    "detail": (
                        "Using 85%+ of their plan quota. Good time to prompt an upgrade."
                    ),
                    "count": at_count,
                    "link": "/subscriptions",
                }
            )

        if inactive > 0:
            feed.append(
                {
                    "type": "inactive_users",
                    "severity": "info",
                    "title": (
                        f"{inactive} user{'' if inactive <= 1 else 's'} inactive for 14+ days"
                    ),
                    "detail": (
                        "Have domains set up but no recent events. May need onboarding help."
                    ),
                    "count": inactive,
                    "link": "/users",
                }
            )

        if upgraded > 0:
            feed.append(
                {
                    "type": "recent_upgrades",
                    "severity": "success",
                    "title": (
                        f"{upgraded} new subscription{'' if upgraded <= 1 else 's'} this week"
                    ),
                    # `+₦${newMrr.toLocaleString()} ...`
                    "detail": (
                        f"+₦{js_to_locale_string(new_mrr)} new MRR in the last 7 days."
                    ),
                    "count": upgraded,
                    "link": "/subscriptions",
                }
            )

        return jsjson({"actions": feed})
    except Exception as exc:  # noqa: BLE001
        log.error(f"Dashboard actions error: {exc}")
        raise SimpleError("Failed to load action feed", 500) from None
