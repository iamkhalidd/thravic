"""What a user's plan allows — the one place limits are read for enforcement.

The plan comes from the user's latest *active* subscription, as in the feature
gate; anything else (no row, canceled, expired) is the free plan. Limits are read
from the subscription row, which checkout writes from the plans table, so an admin
price/limit change applies to new purchases.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..db import query_one
from ..plans import PLAN_FEATURES, PLAN_LIMITS

FREE_PLAN = "free"


@dataclass(frozen=True)
class Plan:
    user_id: str
    name: str
    features: list[str]
    events_limit: int
    domains_limit: int


async def for_user(user_id: str) -> Plan:
    row = user_id and await query_one(
        """
        SELECT plan, events_limit, domains_limit FROM subscriptions
        WHERE user_id = $1 AND status = 'active'
        ORDER BY created_at DESC LIMIT 1
        """,
        user_id,
    )
    free = PLAN_LIMITS[FREE_PLAN]
    if not row:
        return Plan(
            str(user_id),
            FREE_PLAN,
            PLAN_FEATURES[FREE_PLAN],
            int(free["eventsLimit"]),
            int(free["domainsLimit"]),
        )

    name = str(row.get("plan") or FREE_PLAN).lower().strip()
    return Plan(
        str(user_id),
        name,
        PLAN_FEATURES.get(name, PLAN_FEATURES[FREE_PLAN]),
        int(row.get("events_limit") or free["eventsLimit"]),
        int(row.get("domains_limit") or free["domainsLimit"]),
    )


async def owner_plan(domain_id: str) -> Plan:
    """The plan of the user who owns `domain_id` — members inherit the owner's."""
    row = await query_one("SELECT user_id FROM domains WHERE id = $1", domain_id)
    return await for_user(str(row["user_id"]) if row else "")
