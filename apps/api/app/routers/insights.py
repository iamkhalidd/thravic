"""AI insights routes — port of `routes/insights.ts`.

Both handlers are gated by `requireFeature('insights')` and only Pro/Agency plans
pass the gate.

`GET /:domainId?start=&end=` serves today's insight report for that range
(default: the last 7 days) and `POST /:domainId/refresh` makes a new one; see
`insight_service` (facts in `insight_facts`). The model is any OpenAI-compatible
API (`AI_*` settings); without one, insights are written by rules from the same
facts.

`POST /:domainId/explain` is the AI analyst: why one metric changed, see
`analyst_service`.

`GET /:domainId/trends` is the last two weeks of pageviews and the week ahead:
a Holt-Winters forecast with a likely range (`ml.forecast`) once the site has
three whole weeks of data, else the moving average carried on (`method`).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from ..errors import SimpleError
from ..js_compat import js_round
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.auth import AuthUser, require_auth
from ..middleware.feature_gate import require_feature
from ..ml import forecast as ml_forecast
from ..ml import series
from ..services import (
    analyst_service,
    assistant_service,
    domain_service,
    event_service,
    insight_facts,
    insight_service,
)
from .analytics import _parse_date

log = create_logger("Insights")

router = APIRouter()

TREND_WINDOW_DAYS = 14
HISTORICAL_POINTS = 14
FORECAST_POINTS = 7
CURRENT_WINDOW_DAYS = 7

EMA_WEIGHT_PREVIOUS = 0.7
EMA_WEIGHT_CURRENT = 0.3

# The forecast model learns from up to 8 weeks; with under `ml_forecast.MIN_DAYS`
# of them it falls back to carrying the moving average on.
FIT_DAYS = 56
# The week ahead must differ from the last week by this much to count as a trend
TREND_CHANGE = 0.05
# Share of days expected inside the forecast's range (`ml_forecast.RANGE_Z`)
RANGE_PCT = 80

FAILED_TRENDS = "Failed to generate trends"
FAILED_INSIGHTS = "Failed to generate insights"

MONTH_DAY_LENGTH = 10  # len("YYYY-MM-DD") for `toISOString().split('T')[0]`


def _percent_change(current: float, previous: float) -> int:
    if previous == 0:
        return 100 if current > 0 else 0
    return js_round(((current - previous) / previous) * 100)


def _utc_day(value: datetime) -> str:
    """`date.toISOString().split('T')[0]` — always computed in UTC."""
    return value.astimezone(UTC).isoformat()[:MONTH_DAY_LENGTH]


async def _require_domain(domain_id: str, user_id: str) -> dict:
    """The owner or any team member; the feature gate already checks the owner's plan."""
    domain = await domain_service.get_by_id(domain_id)
    if not domain or not (
        domain_service.is_owner(domain, user_id)
        or await domain_service.has_access(domain_id, user_id)
    ):
        raise SimpleError("Domain not found", 404)
    return domain


def _range(start: str | None, end: str | None) -> tuple[datetime | None, datetime | None]:
    """The requested range; either end missing means the service's default."""
    parsed = (_parse_date(start) if start else None, _parse_date(end) if end else None)
    if parsed[0] and parsed[1] and parsed[0] >= parsed[1]:
        raise SimpleError("start must be before end", 400)
    return parsed


def _bucket_key(value: object) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _simple_forecast(historical: list[dict], now: datetime) -> dict:
    """The moving average's line carried on, for sites with under three weeks of data."""
    last_pv = historical[-1]["pageviewsMA"]
    trend_factor = (historical[-1]["pageviewsMA"] - historical[0]["pageviewsMA"]) / (
        TREND_WINDOW_DAYS
    )

    forecast: list[dict] = []
    for i in range(1, FORECAST_POINTS + 1):
        date = now + timedelta(days=i)
        forecast.append(
            {"date": _utc_day(date), "predicted": max(0, js_round(last_pv + (trend_factor * i)))}
        )

    if trend_factor > 1:
        direction = "up"
    elif trend_factor < -1:
        direction = "down"
    else:
        direction = "stable"

    return {
        "forecast": forecast,
        "trend": {"direction": direction, "strength": abs(trend_factor)},
        "method": "simple",
    }


@router.get("/{domainId}/trends")
async def trends(
    domainId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("insights")),
):
    try:
        domain = await _require_domain(domainId, user.user_id)

        now = datetime.now(UTC)
        # From midnight, so the first day the model sees is a whole one
        start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=FIT_DAYS)

        timeseries = await event_service.get_timeseries(domain["id"], start, now, "day")
        buckets = {_bucket_key(row["bucket"]): row for row in timeseries}

        historical: list[dict] = []
        running_views = 0.0
        running_visitors = 0.0

        # Iterates 13..0 so the most recent day lands last
        for i in range(HISTORICAL_POINTS - 1, -1, -1):
            date = now - timedelta(days=i)
            date_string = _utc_day(date)
            data_point = next(
                (row for key, row in buckets.items() if key.startswith(date_string)),
                None,
            )

            pageviews = (data_point or {}).get("pageviews") or 0
            visitors = (data_point or {}).get("visitors") or 0

            # Exponentially weighted moving average, seeded from zero
            running_views = (running_views * EMA_WEIGHT_PREVIOUS) + (pageviews * EMA_WEIGHT_CURRENT)
            running_visitors = (running_visitors * EMA_WEIGHT_PREVIOUS) + (
                visitors * EMA_WEIGHT_CURRENT
            )

            historical.append(
                {
                    "date": date_string,
                    "pageviews": pageviews,
                    "visitors": visitors,
                    "pageviewsMA": js_round(running_views),
                    "visitorsMA": js_round(running_visitors),
                }
            )

        # Whole days only: today is still filling up, so it would read as a drop.
        today = now.date()
        values = series.trim_leading_zeros(
            series.daily_values(
                timeseries, "pageviews", today - timedelta(days=FIT_DAYS), today - timedelta(days=1)
            )
        )
        # Fitted through yesterday, so the first day ahead is today.
        model = ml_forecast.forecast(values, FORECAST_POINTS + 1)

        if model is None:
            return jsjson({"historical": historical, **_simple_forecast(historical, now)})

        forecast = [
            {
                "date": _utc_day(now + timedelta(days=i)),
                "predicted": js_round(point.predicted),
                "low": js_round(point.low),
                "high": js_round(point.high),
            }
            for i, point in enumerate(model.points[1:], start=1)
        ]
        # The week ahead against the last whole week
        recent = sum(values[-ml_forecast.SEASON :]) / ml_forecast.SEASON
        ahead = sum(p["predicted"] for p in forecast) / len(forecast)
        if recent and ahead >= recent * (1 + TREND_CHANGE):
            direction = "up"
        elif recent and ahead <= recent * (1 - TREND_CHANGE):
            direction = "down"
        else:
            direction = "stable"

        return jsjson(
            {
                "historical": historical,
                "forecast": forecast,
                "trend": {
                    "direction": direction,
                    "strength": abs(ahead - recent) / FORECAST_POINTS,
                },
                "method": "seasonal",
                "rangePct": RANGE_PCT,
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Trends error: {exc}")
        raise SimpleError(FAILED_TRENDS, 500) from None


@router.get("/{domainId}")
async def insights(
    domainId: str,
    start: str | None = Query(None),
    end: str | None = Query(None),
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("insights")),
):
    """Today's report for the range: generated on its first view of the (UTC) day, then cached."""
    try:
        domain = await _require_domain(domainId, user.user_id)
        report = await insight_service.todays_report(domain, *_range(start, end))
        return jsjson(await insight_service.to_response(report, str(domain["id"])))
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Insights error: {exc}")
        raise SimpleError(FAILED_INSIGHTS, 500) from None


class _ExplainBody(BaseModel):
    # Either a question, or a metric (and event) from the picker or an "Explain this" button.
    question: str = Field("", max_length=500)
    metric: str | None = Field(None, max_length=40)
    event: str | None = Field(None, max_length=200)
    start: str | None = None
    end: str | None = None
    # The dashboard's range (startDate, endDate) and the browser's tzOffset, as Ask Thravic sends.
    context: dict[str, Any] = Field(default_factory=dict)


@router.get("/{domainId}/explain/options")
async def explain_options(
    domainId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("insights")),
):
    """What the analyst can explain on this site, for the picker, and the questions left today."""
    domain = await _require_domain(domainId, user.user_id)
    events = await analyst_service.site_events(str(domain["id"]), datetime.now(UTC))
    return jsjson({**analyst_service.options(events), "usage": await _usage(domainId, user)})


async def _usage(domain_id: str, user: AuthUser) -> dict[str, int]:
    limit = await assistant_service.daily_limit(domain_id)
    used = await assistant_service.asked_today(user.user_id, datetime.now(UTC))
    return {"used": used, "limit": limit, "left": max(0, limit - used)}


@router.post("/{domainId}/explain")
async def explain(
    domainId: str,
    body: _ExplainBody,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("insights")),
):
    """Why a metric changed: the likely cause, the breakdown, evidence, recordings and fixes.

    Each analysis counts as one Ask Thravic question. When the metric can't be
    told from the question, answers `status: "choose"` with the picker's options
    (free).
    """
    domain = await _require_domain(domainId, user.user_id)
    now = datetime.now(UTC)
    question = body.question.strip()
    events = await analyst_service.site_events(str(domain["id"]), now)

    metric, event = body.metric, (body.event or "").strip() or None
    if metric is None:
        metric, event = analyst_service.parse_metric(question, events)
    if metric not in insight_facts.EXPLAIN_METRICS or (metric == "event" and not event):
        return jsjson({"status": "choose", **analyst_service.options(events)})

    counts = await _usage(domainId, user)
    if counts["left"] <= 0:
        raise SimpleError(
            f"You've asked {counts['limit']} questions today, the most your plan allows. "
            "You can ask again tomorrow.",
            429,
        )
    clock = assistant_service.clock_for(body.context, now)
    start, end = analyst_service.choose_period(question, clock, *_range(body.start, body.end))
    try:
        result = await analyst_service.analyse(domain, metric, event, start, end, question)
    except Exception as exc:
        log.error(f"Analyst error: {exc}")
        raise SimpleError("Couldn't explain that just now. Please try again.", 500) from None

    if result["status"] == "ok":
        await assistant_service.record_question(user.user_id, domainId)
        counts = {**counts, "used": counts["used"] + 1, "left": counts["left"] - 1}
    return jsjson({**result, "usage": counts})


@router.post("/{domainId}/refresh")
async def refresh_insights(
    domainId: str,
    start: str | None = Query(None),
    end: str | None = Query(None),
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("insights")),
):
    """A new report for the range now, up to `MAX_REFRESHES_PER_DAY` times a day."""
    try:
        domain = await _require_domain(domainId, user.user_id)
        report = await insight_service.refresh(domain, *_range(start, end))
        if report is None:
            raise SimpleError(
                f"You can refresh insights {insight_service.MAX_REFRESHES_PER_DAY} times a day. "
                "They update on their own tomorrow.",
                429,
            )
        return jsjson(await insight_service.to_response(report, str(domain["id"])))
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Insights refresh error: {exc}")
        raise SimpleError(FAILED_INSIGHTS, 500) from None
