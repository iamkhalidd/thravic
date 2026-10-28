"""Plan and feature definitions — port of `config/plans.ts` (single source of truth)."""

from __future__ import annotations

PlanName = str
PlanFeature = str

PLAN_FEATURES: dict[str, list[str]] = {
    "free": [
        "analytics",
        "realtime",
        "utm",
        "heatmaps",
        "recordings",
    ],
    "pro": [
        "analytics",
        "realtime",
        "utm",
        "heatmaps",
        "insights",
        "export",
        "funnels",
        "recordings",
        "experiments",
        "webhooks",
        "team",
    ],
    "agency": [
        "analytics",
        "realtime",
        "utm",
        "heatmaps",
        "insights",
        "export",
        "funnels",
        "recordings",
        "experiments",
        "webhooks",
        "team",
        "client_reports",
        "client_links",
        "client_overview",
    ],
}

ALL_FEATURES: tuple[str, ...] = (
    "analytics",
    "realtime",
    "utm",
    "heatmaps",
    "insights",
    "export",
    "funnels",
    "recordings",
    "experiments",
    "webhooks",
    "team",
    "client_reports",
    "client_links",
    "client_overview",
)

# Maps a feature to the lowest plan that unlocks it
_FEATURE_PLAN_MAP: dict[str, str] = {
    "analytics": "free",
    "realtime": "free",
    "utm": "free",
    "heatmaps": "free",
    "insights": "pro",
    "export": "pro",
    "funnels": "pro",
    "recordings": "free",
    "experiments": "pro",
    "webhooks": "pro",
    "team": "pro",
    "client_reports": "agency",
    "client_links": "agency",
    "client_overview": "agency",
}

PLAN_LIMITS: dict[str, dict[str, object]] = {
    "free": {
        "name": "Hobby",
        "eventsLimit": 50_000,
        "recordingsPerMonth": 100,
        "domainsLimit": 1,
        "retentionDays": 30,
        "price": 0,
    },
    "pro": {
        "name": "Pro",
        "eventsLimit": 250_000,
        "recordingsPerMonth": 1_000,
        "domainsLimit": 5,
        "retentionDays": 365,
        "price": 45_000,
    },
    "agency": {
        "name": "Agency",
        "eventsLimit": 1_000_000,
        "recordingsPerMonth": 5_000,
        "domainsLimit": 25,
        "retentionDays": 730,
        "price": 125_000,
    },
}


def get_plan_for_feature(feature: str) -> str:
    return _FEATURE_PLAN_MAP.get(feature, "free")


def features_for_plan(plan: str | None) -> list[str]:
    """Case-insensitive plan lookup falling back to `free`, matching `featureGate.ts`."""
    normalised = (plan or "free").lower().strip()
    return PLAN_FEATURES.get(normalised, PLAN_FEATURES["free"])
