"""AI insights routes — port of `routes/insights.ts`.

Both handlers are gated by `requireFeature('insights')` and only Pro/Agency plans
pass the gate.

`GET /:domainId` serves today's insight report and `POST /:domainId/refresh`
makes a new one; see `insight_service` (facts in `insight_facts`). The model is
any OpenAI-compatible API (`AI_*` settings); without one, insights are written
by rules from the same facts.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends

from ..errors import SimpleError
from ..js_compat import js_round
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.auth import AuthUser, require_auth
from ..middleware.feature_gate import require_feature
from ..services import domain_service, event_service, insight_service

log = create_logger("Insights")

router = APIRouter()

TREND_WINDOW_DAYS = 14
HISTORICAL_POINTS = 14
FORECAST_POINTS = 7
CURRENT_WINDOW_DAYS = 7

EMA_WEIGHT_PREVIOUS = 0.7
EMA_WEIGHT_CURRENT = 0.3

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


async def _require_owned_domain(domain_id: str, user_id: str) -> dict:
    domain = await domain_service.get_by_id(domain_id)
    if not domain_service.is_owner(domain, user_id):
        raise SimpleError("Domain not found", 404)
    return domain


def _bucket_key(value: object) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


@router.get("/{domainId}/trends")
async def trends(
    domainId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("insights")),
):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)

        now = datetime.now(UTC)
        start = now - timedelta(days=TREND_WINDOW_DAYS)

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

        last_pv = historical[-1]["pageviewsMA"]
        trend_factor = (historical[-1]["pageviewsMA"] - historical[0]["pageviewsMA"]) / (
            TREND_WINDOW_DAYS
        )

        forecast: list[dict] = []
        for i in range(1, FORECAST_POINTS + 1):
            date = now + timedelta(days=i)
            predicted = max(0, js_round(last_pv + (trend_factor * i)))
            forecast.append(
                {
                    "date": _utc_day(date),
                    "predicted": predicted,
                    "confidence": max(0, 100 - (i * 10)),
                }
            )

        if trend_factor > 1:
            direction = "up"
        elif trend_factor < -1:
            direction = "down"
        else:
            direction = "stable"

        return jsjson(
            {
                "historical": historical,
                "forecast": forecast,
                "trend": {"direction": direction, "strength": abs(trend_factor)},
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
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("insights")),
):
    """Today's report: generated on the first view of the (UTC) day, then cached."""
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        report = await insight_service.todays_report(domain)
        return jsjson(await insight_service.to_response(report, str(domain["id"])))
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Insights error: {exc}")
        raise SimpleError(FAILED_INSIGHTS, 500) from None


@router.post("/{domainId}/refresh")
async def refresh_insights(
    domainId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("insights")),
):
    """A new report now, up to `MAX_REFRESHES_PER_DAY` times a day."""
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        report = await insight_service.refresh(domain)
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
