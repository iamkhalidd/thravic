"""What a user's plan allows — the one place limits are read for enforcement.

The plan comes from the user's latest *entitled* subscription (see `entitled`);
anything else (no row, canceled, lapsed) is the free plan. Limits and features
come from the plan's current definition (`plan_catalog`), so an admin change
applies to everyone on that plan, not only to new purchases.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from .. import cache
from ..db import query, query_one
from ..logging import create_logger
from . import plan_catalog

log = create_logger("PlanService")

FREE_PLAN = "free"

# A paid period buys this many days; payments are one-off, not auto-renewing.
PERIOD_DAYS = {"monthly": 30, "yearly": 365}
# Access continues this long after the period ends, so a late renewal loses nothing.
GRACE_DAYS = 3
# After grace a lapsed account keeps its paid plan's data retention this long.
LAPSED_RETENTION_HOLD_DAYS = 90


def entitled(alias: str = "", extra_days: int = 0) -> str:
    """SQL: the subscription row grants its plan now.

    Access is decided from the dates on every check rather than by a job flipping
    `status`, so it ends on time even if no job runs. A NULL period end is an admin
    grant with no end date. `extra_days` widens the window (retention's data hold).
    """
    col = f"{alias}." if alias else ""
    days = GRACE_DAYS + extra_days
    return (
        f"{col}status = 'active' AND ({col}current_period_end IS NULL "
        f"OR {col}current_period_end > NOW() - INTERVAL '{days} days')"
    )


# How long a "this owner is over their event limit" answer is reused. Collection
# runs per tracker batch, so without this every batch would count the month's
# events; the cost is overshooting the limit by up to this much traffic.
QUOTA_CACHE_SECONDS = 60

# Fallback when Redis is unavailable: owner/month key -> (expires_at, over_limit).
_local_quota: dict[str, tuple[float, bool]] = {}



def period_days(plan: plan_catalog.PlanDef) -> int:
    return PERIOD_DAYS.get(plan.interval, PERIOD_DAYS["monthly"])


def next_period(
    current: dict[str, Any] | None,
    bought: plan_catalog.PlanDef,
    previous: plan_catalog.PlanDef | None,
    now: datetime,
) -> tuple[datetime, datetime]:
    """The (start, end) a payment for `bought` gives, given the subscription row.

    * Same plan, still granting access: extends from the current end. Renewing
      early loses no days; renewing in grace continues from the old end, so the
      grace days are not free.
    * A different paid plan still in its period: switches now, and the days
      left are converted at list price into days of the new plan, so an upgrade
      or a downgrade never throws away what was paid.
    * Anything else (first payment, lapsed, admin grant without an end): a new
      period from now.
    """
    days = timedelta(days=period_days(bought))
    end = (current or {}).get("current_period_end")
    granting = (
        current is not None
        and current.get("status") == "active"
        and end is not None
        and end + timedelta(days=GRACE_DAYS) > now
    )
    if not granting:
        return now, now + days

    if current["plan"] == bought.id:
        start = (current.get("current_period_start") or now) if end > now else end
        return start, end + days

    credit = timedelta(0)
    if previous and previous.price > 0 and bought.price > 0 and end > now:
        old_daily = previous.price / period_days(previous)
        new_daily = bought.price / period_days(bought)
        credit = (end - now) * (old_daily / new_daily)
    return now, now + days + credit


@dataclass(frozen=True)
class Plan:
    user_id: str
    name: str
    features: list[str]
    events_limit: int
    domains_limit: int
    # None = unlimited.
    team_limit: int | None = None
    recordings_per_day: int | None = None


async def for_user(user_id: str) -> Plan:
    row = user_id and await query_one(
        f"""
        SELECT plan FROM subscriptions
        WHERE user_id = $1 AND {entitled()}
        ORDER BY created_at DESC LIMIT 1
        """,
        user_id,
    )
    plan = await plan_catalog.get(row.get("plan") if row else FREE_PLAN)
    return Plan(
        str(user_id),
        plan.id,
        list(plan.features),
        plan.events_limit,
        plan.domains_limit,
        plan.team_limit,
        plan.recordings_per_day,
    )


async def owner_plan(domain_id: str) -> Plan:
    """The plan of the user who owns `domain_id` — members inherit the owner's."""
    row = await query_one("SELECT user_id FROM domains WHERE id = $1", domain_id)
    return await for_user(str(row["user_id"]) if row else "")


# The event allowance renews every cycle of a paid plan, counted from when the
# plan started (so a yearly plan gets a fresh "monthly" allowance every 30 days);
# accounts without a paid plan renew on the 1st of each month (UTC).
USAGE_CYCLE = timedelta(days=30)


def usage_window(anchor: datetime | None, now: datetime) -> tuple[datetime, datetime]:
    """(start, resets_at) of the allowance window containing `now`.

    `anchor` is the paid plan's `current_period_start`, or None without one.
    """
    if anchor is None or anchor > now:
        start = datetime(now.year, now.month, 1, tzinfo=UTC)
        year, month = divmod(now.month, 12)
        return start, datetime(now.year + year, month + 1, 1, tzinfo=UTC)
    start = anchor + ((now - anchor) // USAGE_CYCLE) * USAGE_CYCLE
    return start, start + USAGE_CYCLE


async def current_window(user_id: str, now: datetime | None = None) -> tuple[datetime, datetime]:
    """The user's allowance window now, from their paid plan if they have one."""
    row = await query_one(
        f"""
        SELECT current_period_start FROM subscriptions
        WHERE user_id = $1 AND plan <> 'free' AND {entitled()}
        ORDER BY created_at DESC LIMIT 1
        """,
        user_id,
    )
    return usage_window(row["current_period_start"] if row else None, now or datetime.now(UTC))


async def events_this_period(user_id: str, since: datetime | None = None) -> int:
    """Events stored in the current allowance window across the user's domains.

    Counted from `events` itself: nothing writes `usage_logs` or
    `subscriptions.events_used`. Served by the `(domain_id, created_at)` index.
    """
    if since is None:
        since, _ = await current_window(user_id)
    row = await query_one(
        """
        SELECT COUNT(*)::text AS total
        FROM events e
        JOIN domains d ON d.id = e.domain_id
        WHERE d.user_id = $1 AND e.created_at >= $2
        """,
        user_id,
        since,
    )
    return int((row or {}).get("total") or 0)


async def team_member_ids(owner_id: str) -> set[str]:
    """People (other than the owner) on any of the owner's sites: one seat each."""
    rows = await query(
        """
        SELECT DISTINCT dm.user_id FROM domain_members dm
        JOIN domains d ON d.id = dm.domain_id
        WHERE d.user_id = $1 AND dm.user_id <> $1
        """,
        owner_id,
    )
    return {str(row["user_id"]) for row in rows}


async def over_event_limit(owner_id: str) -> bool:
    """Whether the owner has used their plan's events for this allowance window.

    Fails open: if the check itself errors, events are accepted, so a problem
    here can never cost a customer data. A cached "over" can outlive a reset by
    up to `QUOTA_CACHE_SECONDS`.
    """
    key = f"quota:{owner_id}"
    try:
        cached = await cache.get(key)
        if cached is not None:
            return bool(cached)
        local = _local_quota.get(key)
        if local and local[0] > time.monotonic():
            return local[1]

        plan = await for_user(owner_id)
        over = await events_this_period(owner_id) >= plan.events_limit

        await cache.set(key, over, QUOTA_CACHE_SECONDS)
        _local_quota[key] = (time.monotonic() + QUOTA_CACHE_SECONDS, over)
        return over
    except Exception as exc:
        log.error(f"Event limit check failed, accepting events: {exc}")
        return False


def clear_local_quota_cache() -> None:
    """Drop the in-process fallbacks (used by tests)."""
    _local_quota.clear()
    _local_paused.clear()


# ── Sites over the plan's website limit ─────────────────────────────────────
# A lapsed plan can leave an owner with more sites than the free plan covers.
# Those over the limit stop collecting; nothing is deleted, and the owner picks
# which sites keep collecting (`domains.kept_active_at`, latest choice first,
# then the oldest sites). A restricted account's sites all stop.

_local_paused: dict[str, tuple[float, bool]] = {}


async def collecting_site_ids(owner_id: str) -> set[str] | None:
    """The owner's sites that collect, or None when all of them do. A restricted
    account (an owner under 18) collects on none."""
    owner = await query_one("SELECT restricted_reason FROM users WHERE id = $1", owner_id)
    if owner and owner["restricted_reason"]:
        return set()
    plan = await for_user(owner_id)
    rows = await query(
        """
        SELECT id FROM domains WHERE user_id = $1
        ORDER BY kept_active_at DESC NULLS LAST, created_at ASC, id ASC
        """,
        owner_id,
    )
    if len(rows) <= plan.domains_limit:
        return None
    return {str(r["id"]) for r in rows[: plan.domains_limit]}


async def site_paused(owner_id: str, domain_id: str) -> bool:
    """Whether this site is over its owner's website limit and must not collect.

    Cached like the event limit, and fails open: an error here never costs data.
    """
    key = f"site-paused:{domain_id}"
    try:
        cached = await cache.get(key)
        if cached is not None:
            return bool(cached)
        local = _local_paused.get(key)
        if local and local[0] > time.monotonic():
            return local[1]

        collecting = await collecting_site_ids(owner_id)
        paused = collecting is not None and str(domain_id) not in collecting

        await cache.set(key, paused, QUOTA_CACHE_SECONDS)
        _local_paused[key] = (time.monotonic() + QUOTA_CACHE_SECONDS, paused)
        return paused
    except Exception as exc:
        log.error(f"Site limit check failed, accepting events: {exc}")
        return False


async def forget_paused_sites(domain_ids: list[str]) -> None:
    """Drop cached answers after the owner changes which sites collect."""
    for domain_id in domain_ids:
        key = f"site-paused:{domain_id}"
        _local_paused.pop(key, None)
        try:
            await cache.delete(key)
        except Exception:  # noqa: BLE001 — the cache expires on its own
            pass
