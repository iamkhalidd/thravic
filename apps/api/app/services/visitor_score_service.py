"""Visitor scores: how likely each visitor is to convert, and whether a returning
visitor has stopped coming back (models in `ml.convert` and `ml.churn`).

`fit_domain` runs nightly (`jobs/visitor_models`) and stores what it learned in
`site_models`. `score` uses that when the dashboard lists or opens visitors, so
a score always reflects what the visitor has done up to now.

The conversion is the custom event the most visitors sent whose name looks like
one (sign-up, purchase, lead...; the analyst's word list). A site without one,
or with too few converters, gets no conversion scores, and the API says why.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any

from ..db import query
from ..ml import churn, convert
from .analyst_service import CONVERSION_ROOTS
from .client_report_service import SYSTEM_EVENTS
from .domain_service import is_app

EVENT_LOOK_BACK = timedelta(days=90)
TRAIN_LOOK_BACK = timedelta(days=90)
TRAIN_MAX = 5000
SETTLE = timedelta(days=2)  # visitors newer than this may still convert: not trained on
VISIT_DAYS_MAX = 60
SEGMENT_POOL = 500  # recent visitors searched for a segment

EPOCH_DAY = date(1970, 1, 1)  # visit days are counted from here, as in SQL

CONVERSION = "conversion"
CHURN = "churn"


def _compact(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def pick_event(events: list[dict[str, Any]]) -> str | None:
    """The conversion: the first (most visitors) event whose name looks like one."""
    for row in events:
        if any(root in _compact(row["name"]) for root in CONVERSION_ROOTS):
            return row["name"]
    return None


async def conversion_event(domain_id: Any) -> str | None:
    rows = await query(
        """
        SELECT data->>'event' AS name, COUNT(DISTINCT visitor_id)::int AS visitors
        FROM events
        WHERE domain_id = $1 AND type = 'custom' AND created_at >= $2
          AND COALESCE(data->>'event', '') <> '' AND NOT (data->>'event' = ANY($3::text[]))
        GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 50
        """,
        domain_id,
        datetime.now(UTC) - EVENT_LOOK_BACK,
        list(SYSTEM_EVENTS),
    )
    return pick_event(rows)


# Per visitor `v`, for event $2: when they first converted, and what they had done
# before then (everything, if they never did). Feeds `ml.convert.features`.
_FEATURES_SQL = """
    LEFT JOIN LATERAL (
        SELECT MIN(e.created_at) AS at FROM events e
        WHERE e.visitor_id = v.id AND e.type = 'custom' AND e.data->>'event' = $2
    ) conv ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE e.type = 'pageview')::int AS pageviews,
               COUNT(*) FILTER (WHERE e.type IN ('click', 'scroll', 'form'))::int AS interactions,
               MAX(e.created_at) AS last_at
        FROM events e
        WHERE e.visitor_id = v.id AND e.created_at < COALESCE(conv.at, 'infinity')
    ) pre ON TRUE
    LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(span), 0)::float8 AS active_seconds FROM (
            SELECT EXTRACT(EPOCH FROM MAX(e.created_at) - MIN(e.created_at)) AS span
            FROM events e
            WHERE e.visitor_id = v.id AND e.created_at < COALESCE(conv.at, 'infinity')
            GROUP BY e.session_id) spans
    ) act ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS sessions FROM sessions s
        WHERE s.visitor_id = v.id AND s.started_at < COALESCE(conv.at, 'infinity')
    ) ses ON TRUE
    LEFT JOIN LATERAL (
        SELECT s.source_type, s.screen_width FROM sessions s
        WHERE s.visitor_id = v.id ORDER BY s.started_at LIMIT 1
    ) first ON TRUE
"""

_FEATURE_COLUMNS = """
    conv.at IS NOT NULL AS converted, pre.pageviews, pre.interactions, act.active_seconds,
    ses.sessions, first.source_type, first.screen_width,
    EXTRACT(EPOCH FROM COALESCE(pre.last_at, v.first_seen) - v.first_seen)::float8 / 86400
        AS days_known
"""

_TRAIN_SQL = f"""
SELECT * FROM (
    SELECT v.id, v.first_seen, {_FEATURE_COLUMNS}
    FROM visitors v
    {_FEATURES_SQL}
    WHERE v.domain_id = $1 AND v.first_seen >= $3 AND v.first_seen < $4
    ORDER BY v.first_seen DESC
    LIMIT {TRAIN_MAX}
) t
WHERE t.pageviews > 0
ORDER BY t.first_seen
"""

_VISIT_DAYS_SQL = f"""
    LEFT JOIN LATERAL (
        SELECT array_agg(d ORDER BY d) AS days FROM (
            SELECT DISTINCT (s.started_at AT TIME ZONE 'UTC')::date - DATE '1970-01-01' AS d
            FROM sessions s WHERE s.visitor_id = v.id
            ORDER BY d DESC LIMIT {VISIT_DAYS_MAX}) recent
    ) visits ON TRUE
"""

_SITE_GAPS_SQL = f"""
SELECT visits.days FROM visitors v
{_VISIT_DAYS_SQL}
WHERE v.domain_id = $1 AND v.last_seen >= $2 AND v.first_seen < v.last_seen - INTERVAL '1 day'
ORDER BY v.last_seen DESC
LIMIT {TRAIN_MAX}
"""


async def _store(domain_id: Any, kind: str, target: str | None, model: dict) -> None:
    await query(
        """
        INSERT INTO site_models (domain_id, kind, target, model, fitted_at)
        VALUES ($1, $2, $3, $4::jsonb, NOW())
        ON CONFLICT (domain_id, kind) DO UPDATE
        SET target = EXCLUDED.target, model = EXCLUDED.model, fitted_at = NOW()
        RETURNING 1
        """,
        domain_id,
        kind,
        target,
        model,
    )


async def fit_domain(domain: dict[str, Any], now: datetime | None = None) -> dict[str, Any]:
    """Refit both models for a site and store them."""
    now = now or datetime.now(UTC)
    domain_id = domain["id"]

    gaps = []
    for row in await query(_SITE_GAPS_SQL, domain_id, now - TRAIN_LOOK_BACK):
        gap = churn.typical_gap(list(row["days"] or []))
        if gap is not None:
            gaps.append(gap)
    site_gap = churn.site_gap(gaps)
    await _store(domain_id, CHURN, None, {"siteGapDays": site_gap, "visitors": len(gaps)})

    event = await conversion_event(domain_id)
    model = None
    rows: list[dict] = []
    if event and not is_app(domain):
        rows = await query(_TRAIN_SQL, domain_id, event, now - TRAIN_LOOK_BACK, now - SETTLE)
        model = convert.train(rows)
    await _store(
        domain_id,
        CONVERSION,
        event,
        model.to_json() if model else {"visitors": len(rows), "reason": _why_not(event, rows)},
    )
    return {"event": event, "trained": bool(model), "auc": model.auc if model else None}


def _why_not(event: str | None, rows: list[dict]) -> str:
    if not event:
        return "no_event"
    converted = sum(1 for r in rows if r["converted"])
    if len(rows) < convert.MIN_VISITORS or converted < convert.MIN_CONVERTED:
        return "too_little_data"
    return "not_learnable"


async def load(domain_id: Any) -> dict[str, Any]:
    stored = await query(
        "SELECT kind, target, model, fitted_at FROM site_models WHERE domain_id = $1", domain_id
    )
    rows = {r["kind"]: r for r in stored}
    conv, gap = rows.get(CONVERSION), rows.get(CHURN)
    fitted = conv and conv["model"].get("weights")
    model = convert.Model.from_json(conv["model"]) if fitted else None
    return {
        "event": conv["target"] if conv else None,
        "model": model,
        "reason": None if model else (conv["model"].get("reason") if conv else "not_fitted"),
        "fittedAt": conv["fitted_at"] if conv else None,
        "siteGapDays": (gap["model"].get("siteGapDays") if gap else None) or churn.DEFAULT_SITE_GAP,
    }


def model_info(loaded: dict[str, Any]) -> dict[str, Any]:
    """What the dashboard says about the conversion model."""
    model: convert.Model | None = loaded["model"]
    shown = bool(model and model.useful)
    reason = loaded["reason"] if not model else (None if shown else "not_learnable")
    return {
        "event": loaded["event"],
        "available": shown,
        "reason": reason,
        "auc": model.auc if model else None,
        "baseRate": round(model.base_rate, 4) if model else None,
        "trainedOn": model.trained_on if model else None,
        "converted": model.converted if model else None,
        "drivers": model.drivers() if shown else [],
        "fittedAt": loaded["fittedAt"],
        "siteGapDays": loaded["siteGapDays"],
    }


async def score(
    domain_id: Any, visitor_ids: list[Any], loaded: dict[str, Any] | None = None
) -> dict[str, dict[str, Any]]:
    """Scores for these visitors (`visitors.id`), keyed by id as text."""
    if not visitor_ids:
        return {}
    loaded = loaded or await load(domain_id)
    model: convert.Model | None = loaded["model"]
    useful = bool(model and model.useful and loaded["event"])
    rows = await query(
        f"""
        SELECT v.id::text AS id, visits.days {', ' + _FEATURE_COLUMNS if useful else ''}
        FROM visitors v
        {_VISIT_DAYS_SQL}
        {_FEATURES_SQL if useful else ''}
        WHERE v.domain_id = $1 AND v.id = ANY({'$3' if useful else '$2'}::uuid[])
        """,
        *((domain_id, loaded["event"], visitor_ids) if useful else (domain_id, visitor_ids)),
    )
    today = (datetime.now(UTC).date() - EPOCH_DAY).days
    scores: dict[str, dict[str, Any]] = {}
    for row in rows:
        conversion = None
        if useful:
            if row["converted"]:
                conversion = {"converted": True, "probability": None, "band": None}
            else:
                p = model.probability(convert.features(row))
                conversion = {
                    "converted": False,
                    "probability": round(p, 3),
                    "band": convert.band(p, model.base_rate),
                }
        risk = churn.assess(list(row["days"] or []), today, loaded["siteGapDays"])
        scores[row["id"]] = {
            "conversion": conversion,
            "churn": None if risk is None else {
                "risk": risk.risk,
                "band": risk.band,
                "typicalGapDays": risk.typical_gap_days,
                "daysAway": risk.days_away,
            },
        }
    return scores


def in_segment(scored: dict[str, Any] | None, segment: str) -> float | None:
    """How strongly a visitor belongs to a segment (higher first), or None."""
    if not scored:
        return None
    if segment == "likely":
        c = scored["conversion"]
        return c["probability"] if c and c["band"] in ("high", "medium") else None
    if segment == "at_risk":
        c = scored["churn"]
        return c["risk"] if c and c["band"] in ("high", "medium") else None
    return None
