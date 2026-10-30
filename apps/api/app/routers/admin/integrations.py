"""Integrations: the sites sending data through the Thravic Shopify app.

Thravic stores nothing about a Shopify install (see `routers/shopify.py`), so a
store is known by its traffic: the app's pixel prefixes its event ids with
`shopify-`, and the daily totals job counts those per site per day
(`daily_domain_stats.shopify_events`). A store that installed the app but sent
nothing yet is not listed.
"""

from __future__ import annotations

from fastapi import APIRouter

from ...db import query
from ...errors import SimpleError
from ...json_response import jsjson
from ...logging import create_logger

log = create_logger("Admin:Integrations")

router = APIRouter()

LOOKBACK_DAYS = 90
# The totals are refreshed hourly; a store quiet for longer than this has
# probably removed the app or lost its tracking ID.
ACTIVE_WITHIN_DAYS = 2


@router.get("/shopify")
@router.get("/shopify/")
async def shopify_stores():
    try:
        stores = await query(
            """
            SELECT d.id AS domain_id, d.domain, d.name AS site_name,
                   u.id AS user_id, u.email AS owner_email, u.subscription AS plan,
                   MIN(s.day) AS first_seen, MAX(s.day) AS last_seen,
                   COALESCE(SUM(s.shopify_events) FILTER (WHERE s.day > CURRENT_DATE - 7), 0)::int
                       AS events_7d,
                   COALESCE(SUM(s.shopify_events) FILTER (WHERE s.day > CURRENT_DATE - 30), 0)::int
                       AS events_30d,
                   (MAX(s.day) >= CURRENT_DATE - $2::int) AS active
            FROM daily_domain_stats s
            JOIN domains d ON d.id = s.domain_id
            JOIN users u ON u.id = d.user_id
            WHERE s.shopify_events > 0 AND s.day > CURRENT_DATE - $1::int
            GROUP BY d.id, d.domain, d.name, u.id, u.email, u.subscription
            ORDER BY MAX(s.day) DESC, d.domain
            """,
            LOOKBACK_DAYS,
            ACTIVE_WITHIN_DAYS,
        )
        return jsjson(
            {
                "stores": stores,
                "lookbackDays": LOOKBACK_DAYS,
                "activeWithinDays": ACTIVE_WITHIN_DAYS,
            }
        )
    except Exception as exc:  # noqa: BLE001
        log.error(f"Shopify stores error: {exc}")
        raise SimpleError("Failed to load Shopify stores", 500) from None
