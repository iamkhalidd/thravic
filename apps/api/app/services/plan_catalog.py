"""Plan definitions, read from the `plans` table the admin edits.

Every limit and feature check, the payment flow and the public pricing read
plans through here, so an admin change applies everywhere — to new and existing
customers — within `CACHE_SECONDS` (at once on the instance that saved it).

`app/plans.py` is only the fallback when the table can't be read (no database,
or a plan id the table doesn't know), so a database hiccup never locks everyone
out of their features.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from .. import plans as defaults
from ..db import query
from ..logging import create_logger

log = create_logger("PlanCatalog")

CACHE_SECONDS = 60
FREE_PLAN = "free"

# Feature ids and the wording used for them on pricing cards.
FEATURE_LABELS: dict[str, str] = {
    "analytics": "Core analytics",
    "realtime": "Realtime visitors",
    "utm": "UTM & campaign tracking",
    "heatmaps": "Heatmaps",
    "recordings": "Session recordings",
    "funnels": "Funnels",
    "insights": "AI insights",
    "export": "CSV export",
    "experiments": "A/B experiments",
    "webhooks": "Webhooks",
    "team": "Team members",
}


@dataclass(frozen=True)
class PlanDef:
    id: str
    name: str
    price: int = 0
    currency: str = "NGN"
    interval: str = "monthly"
    events_limit: int = 0
    domains_limit: int = 0
    # None = unlimited.
    team_limit: int | None = None
    recordings_per_day: int | None = None
    features: tuple[str, ...] = ()
    active: bool = True
    sort_order: int = 0
    tagline: str = ""
    extra_features: tuple[str, ...] = ()
    badge: str = ""
    show_on_landing: bool = True
    retention: dict[str, int] = field(default_factory=dict)


_cache: tuple[float, dict[str, PlanDef]] | None = None


def invalidate() -> None:
    """Forget the cached plans (after an admin edit)."""
    global _cache
    _cache = None


def _fallback() -> dict[str, PlanDef]:
    return {
        key: PlanDef(
            id=key,
            name=str(tier["name"]),
            price=int(tier["price"]),
            events_limit=int(tier["eventsLimit"]),
            domains_limit=int(tier["domainsLimit"]),
            features=tuple(defaults.PLAN_FEATURES.get(key, [])),
            sort_order=index,
            retention={"events": int(tier["retentionDays"])},
        )
        for index, (key, tier) in enumerate(defaults.PLAN_LIMITS.items())
    }


def _from_row(row: dict[str, Any], retention: dict[str, Any] | None) -> PlanDef:
    return PlanDef(
        id=row["id"],
        name=row["name"],
        price=int(row["price"] or 0),
        currency=row["currency"] or "NGN",
        interval=row["interval"] or "monthly",
        events_limit=int(row["events_limit"] or 0),
        domains_limit=int(row["domains_limit"] or 0),
        team_limit=row.get("team_limit"),
        recordings_per_day=row.get("recordings_per_day"),
        features=tuple(row["features"] or ()),
        active=bool(row["active"]),
        sort_order=int(row["sort_order"] or 0),
        tagline=row.get("tagline") or "",
        extra_features=tuple(row.get("extra_features") or ()),
        badge=row.get("badge") or "",
        show_on_landing=bool(row.get("show_on_landing", True)),
        retention={
            "events": int(retention["events_days"]),
            "sessions": int(retention["sessions_days"]),
            "recordings": int(retention["recordings_days"]),
            "heatmaps": int(retention["heatmaps_days"]),
        }
        if retention
        else {"events": int(row.get("retention_days") or 30)},
    )


async def all_plans() -> dict[str, PlanDef]:
    """Every plan, inactive ones included (their subscribers keep them)."""
    global _cache
    if _cache and _cache[0] > time.monotonic():
        return _cache[1]
    try:
        rows = await query("SELECT * FROM plans ORDER BY sort_order ASC, created_at ASC")
        policies = {r["plan"]: r for r in await query("SELECT * FROM data_retention_policies")}
        loaded = {row["id"]: _from_row(row, policies.get(row["id"])) for row in rows}
    except Exception as exc:  # noqa: BLE001 - fall back rather than lock users out
        log.error(f"Could not load plans, using defaults: {exc}")
        return _fallback()
    if not loaded:
        loaded = _fallback()
    _cache = (time.monotonic() + CACHE_SECONDS, loaded)
    return loaded


async def get(plan_id: str | None) -> PlanDef:
    """The plan by id (case-insensitive), or the free plan for unknown ids."""
    plans = await all_plans()
    key = (plan_id or FREE_PLAN).lower().strip()
    return plans.get(key) or plans.get(FREE_PLAN) or _fallback()[FREE_PLAN]


async def find(plan_id: str | None) -> PlanDef | None:
    """The plan by id, or None — for purchases, where a fallback would be wrong."""
    return (await all_plans()).get((plan_id or "").lower().strip())


async def lowest_plan_with(feature: str) -> str:
    """The cheapest active plan that includes `feature`, for upgrade prompts."""
    candidates = [p for p in (await all_plans()).values() if p.active and feature in p.features]
    if not candidates:
        return defaults.get_plan_for_feature(feature)
    return min(candidates, key=lambda p: (p.price, p.sort_order)).id


def _amount(value: int) -> str:
    if value >= 1_000_000 and value % 1_000_000 == 0:
        return f"{value // 1_000_000}M"
    if value >= 1_000 and value % 1_000 == 0:
        return f"{value // 1_000}k"
    return f"{value:,}"


def _retention_label(days: int) -> str:
    if days % 365 == 0:
        return f"{days // 365}-year retention"
    return f"{days}-day retention"


def _feature_label(feature: str, plan: PlanDef) -> str:
    if feature == "team":
        if plan.team_limit is None:
            return "Unlimited team members"
        return f"Up to {plan.team_limit} team member{'' if plan.team_limit == 1 else 's'}"
    if feature == "recordings" and plan.recordings_per_day is not None:
        return f"Session recordings ({_amount(plan.recordings_per_day)}/day)"
    return FEATURE_LABELS.get(feature, feature.replace("_", " ").capitalize())


def bullets(plan: PlanDef, plans: list[PlanDef]) -> list[str]:
    """Pricing-card lines, generated from what the plan actually grants.

    When a cheaper active plan's features are all included, the card says
    "Everything in <that plan>" and lists only what this plan adds, so cards
    stay short and can't contradict each other.
    """
    lines = [
        f"{plan.domains_limit} website{'' if plan.domains_limit == 1 else 's'}",
        f"{_amount(plan.events_limit)} events/month",
    ]
    cheaper = [
        p
        for p in plans
        if p.id != plan.id
        and p.active
        and (p.price, p.sort_order) < (plan.price, plan.sort_order)
        and set(p.features) <= set(plan.features)
    ]
    base = max(cheaper, key=lambda p: (p.price, p.sort_order), default=None)
    features = list(plan.features)
    if base and base.features:
        lines.append(f"Everything in {base.name}")
        # Keep a feature whose limit differs (team size, recordings/day).
        features = [
            f
            for f in features
            if f not in base.features or _feature_label(f, plan) != _feature_label(f, base)
        ]
    lines += [_feature_label(f, plan) for f in features]
    if plan.retention.get("events"):
        lines.append(_retention_label(plan.retention["events"]))
    return lines + list(plan.extra_features)


def public(plan: PlanDef, plans: list[PlanDef]) -> dict[str, Any]:
    """The plan as the pricing pages and checkout see it."""
    return {
        "id": plan.id,
        "name": plan.name,
        "price": plan.price,
        "currency": plan.currency,
        "interval": plan.interval,
        "events_limit": plan.events_limit,
        "domains_limit": plan.domains_limit,
        "team_limit": plan.team_limit,
        "recordings_per_day": plan.recordings_per_day,
        "retention_days": plan.retention.get("events"),
        "features": list(plan.features),
        "tagline": plan.tagline,
        "badge": plan.badge,
        "show_on_landing": plan.show_on_landing,
        "bullets": bullets(plan, plans),
        "sort_order": plan.sort_order,
    }
