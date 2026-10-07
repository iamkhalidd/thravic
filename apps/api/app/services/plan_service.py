"""What a user's plan allows — the one place limits are read for enforcement.

The plan comes from the user's latest *active* subscription, as in the feature
gate; anything else (no row, canceled, expired) is the free plan. Limits are read
from the subscription row, which checkout writes from the plans table, so an admin
price/limit change applies to new purchases.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import UTC, datetime

from .. import cache
from ..db import query_one
from ..logging import create_logger
from ..plans import PLAN_FEATURES, PLAN_LIMITS

log = create_logger("PlanService")

FREE_PLAN = "free"

# How long a "this owner is over their event limit" answer is reused. Collection
# runs per tracker batch, so without this every batch would count the month's
# events; the cost is overshooting the limit by up to this much traffic.
QUOTA_CACHE_SECONDS = 60

# Fallback when Redis is unavailable: owner/month key -> (expires_at, over_limit).
_local_quota: dict[str, tuple[float, bool]] = {}


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


async def events_this_month(user_id: str) -> int:
    """Events stored this calendar month (UTC) across the user's domains.

    Counted from `events` itself: nothing writes `usage_logs` or
    `subscriptions.events_used`. Served by the `(domain_id, created_at)` index.
    """
    now = datetime.now(UTC)
    row = await query_one(
        """
        SELECT COUNT(*)::text AS total
        FROM events e
        JOIN domains d ON d.id = e.domain_id
        WHERE d.user_id = $1 AND e.created_at >= $2
        """,
        user_id,
        datetime(now.year, now.month, 1, tzinfo=UTC),
    )
    return int((row or {}).get("total") or 0)


async def over_event_limit(owner_id: str) -> bool:
    """Whether the owner has used their plan's events for this month.

    Fails open: if the check itself errors, events are accepted, so a problem
    here can never cost a customer data.
    """
    key = f"quota:{owner_id}:{datetime.now(UTC):%Y-%m}"
    try:
        cached = await cache.get(key)
        if cached is not None:
            return bool(cached)
        local = _local_quota.get(key)
        if local and local[0] > time.monotonic():
            return local[1]

        plan = await for_user(owner_id)
        over = await events_this_month(owner_id) >= plan.events_limit

        await cache.set(key, over, QUOTA_CACHE_SECONDS)
        _local_quota[key] = (time.monotonic() + QUOTA_CACHE_SECONDS, over)
        return over
    except Exception as exc:
        log.error(f"Event limit check failed, accepting events: {exc}")
        return False


def clear_local_quota_cache() -> None:
    """Drop the in-process fallback (used by tests)."""
    _local_quota.clear()
