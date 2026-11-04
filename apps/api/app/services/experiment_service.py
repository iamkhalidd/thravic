"""A/B test results: who saw each version, who then converted, and who is winning.

The tracker puts each visitor in a version (`TF('variant', key)`) and sends one
`experiment_view` custom event per page that asked, with the experiment's id and
the version. A visitor counts for the version of their first view between the
test's start and end, and converts if they sent the goal event at or after that
first view and before the end. `ml.abtest` turns the counts into a verdict.

The daily check (`jobs/experiment_check`) stores each running test's latest
results in `experiments.result` and sets `decided_at` the first time a winner is
called; the hourly smart alerts then tell the owner once (`alerted_at`).
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from ..db import query
from ..ml import abtest
from . import plan_service
from .domain_service import is_app

EXPOSURE_EVENT = "experiment_view"
FEATURE = "experiments"
KEY_MAX = 80

_RESULTS_SQL = """
WITH seen AS (
    SELECT DISTINCT ON (e.visitor_id) e.visitor_id, e.data->>'variant' AS variant,
           e.created_at AS at
    FROM events e
    WHERE e.domain_id = $1 AND e.type = 'custom' AND e.data->>'event' = 'experiment_view'
      AND e.data->>'experiment' = $2 AND e.created_at >= $3 AND e.created_at < $4
      AND e.visitor_id IS NOT NULL
    ORDER BY e.visitor_id, e.created_at
)
SELECT s.variant, COUNT(*)::int AS visitors,
       COUNT(*) FILTER (WHERE $5::text IS NOT NULL AND EXISTS (
           SELECT 1 FROM events g
           WHERE g.domain_id = $1 AND g.visitor_id = s.visitor_id AND g.type = 'custom'
             AND g.data->>'event' = $5 AND g.created_at >= s.at AND g.created_at < $4
       ))::int AS conversions
FROM seen s
GROUP BY s.variant
"""


def make_key(name: str) -> str:
    """The name a site uses for a test, from its name (as the migration does)."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:KEY_MAX]
    return slug or "experiment"


async def results(experiment: dict[str, Any], now: datetime | None = None) -> dict[str, Any]:
    """Each version's visitors and conversions so far, and the verdict."""
    now = now or datetime.now(UTC)
    start = experiment.get("started_at") or experiment["created_at"]
    end = experiment.get("ended_at") or now
    goal = experiment.get("goal_event") or None
    rows = await query(
        _RESULTS_SQL, experiment["domain_id"], str(experiment["id"]), start, end, goal
    )
    counts = {r["variant"]: r for r in rows}
    variants = [
        {
            **v,
            "visitors": (counts.get(str(v["id"])) or {}).get("visitors", 0),
            "conversions": (counts.get(str(v["id"])) or {}).get("conversions", 0),
        }
        for v in experiment.get("variants") or []
    ]
    verdict = abtest.analyse(variants) if len(variants) >= 2 else abtest.analyse([])
    return {**verdict, "goalEvent": goal, "computedAt": now.isoformat()}


async def check_domain(domain_id: Any, now: datetime | None = None) -> dict[str, int]:
    """Refresh the stored results of a site's running tests."""
    now = now or datetime.now(UTC)
    checked = decided = 0
    running = await query(
        "SELECT * FROM experiments WHERE domain_id = $1 AND status = 'active'", domain_id
    )
    for experiment in running:
        result = await results(experiment, now)
        won = result["status"] == abtest.WINNER
        await query(
            """
            UPDATE experiments
            SET result = $2::jsonb,
                decided_at = CASE WHEN $3 THEN COALESCE(decided_at, $4) ELSE decided_at END
            WHERE id = $1
            RETURNING 1
            """,
            experiment["id"],
            result,
            won,
            now,
        )
        checked += 1
        decided += 1 if won and not experiment.get("decided_at") else 0
    return {"checked": checked, "decided": decided}


async def tracker_experiments(domain: dict[str, Any]) -> list[dict[str, Any]]:
    """Running tests as the tracker needs them, for a site whose plan has tests."""
    if is_app(domain):
        return []
    plan = await plan_service.owner_plan(domain["id"])
    if FEATURE not in plan.features:
        return []
    rows = await query(
        "SELECT id, key, variants, traffic_allocation FROM experiments "
        "WHERE domain_id = $1 AND status = 'active' AND key IS NOT NULL ORDER BY created_at",
        domain["id"],
    )
    return [
        {
            "id": str(r["id"]),
            "key": r["key"],
            "traffic": r["traffic_allocation"] if r["traffic_allocation"] is not None else 100,
            "variants": [
                {"id": str(v["id"]), "weight": v.get("weight") or 0}
                for v in (r["variants"] or [])
            ],
        }
        for r in rows
    ]


def winner_name(experiment: dict[str, Any]) -> str | None:
    """The name of the version a stored result called the winner."""
    result = experiment.get("result") or {}
    for v in result.get("variants") or []:
        if v["id"] == result.get("winner"):
            return v["name"]
    return None
