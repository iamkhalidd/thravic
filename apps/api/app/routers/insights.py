"""AI insights routes — port of `routes/insights.ts`.

Both handlers are gated by `requireFeature('insights')` and only Pro/Agency plans
pass the gate.

⚠️ `GET /:domainId` calls Google Gemini when `GEMINI_API_KEY` is set. The gate
runs first, so a free-plan caller never reaches the API. The happy path is
therefore *not* covered by parity specs (it needs a Pro plan plus a live,
non-deterministic model response) — only the 403 gate path is.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends

from ..config import get_settings
from ..errors import SimpleError
from ..js_compat import js_round
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.auth import AuthUser, require_auth
from ..middleware.feature_gate import require_feature
from ..services import domain_service, event_service, session_service

log = create_logger("Insights")

router = APIRouter()

TREND_WINDOW_DAYS = 14
HISTORICAL_POINTS = 14
FORECAST_POINTS = 7
CURRENT_WINDOW_DAYS = 7

EMA_WEIGHT_PREVIOUS = 0.7
EMA_WEIGHT_CURRENT = 0.3

GEMINI_MODEL = "gemini-1.5-flash"
GEMINI_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)
GEMINI_TIMEOUT_SECONDS = 30.0

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
            running_views = (running_views * EMA_WEIGHT_PREVIOUS) + (
                pageviews * EMA_WEIGHT_CURRENT
            )
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
    try:
        domain = await _require_owned_domain(domainId, user.user_id)

        now = datetime.now(UTC)
        current_end = now
        current_start = now - timedelta(days=CURRENT_WINDOW_DAYS)
        previous_end = current_start
        previous_start = now - timedelta(days=CURRENT_WINDOW_DAYS * 2)

        (
            current_pageviews,
            previous_pageviews,
            current_visitors,
            previous_visitors,
            current_sessions,
            previous_sessions,
            current_bounce_rate,
            previous_bounce_rate,
            current_avg_duration,
            previous_avg_duration,
        ) = (
            await event_service.count_by_domain(
                domain["id"], current_start, current_end, "pageview"
            ),
            await event_service.count_by_domain(
                domain["id"], previous_start, previous_end, "pageview"
            ),
            await event_service.count_unique_visitors(
                domain["id"], current_start, current_end
            ),
            await event_service.count_unique_visitors(
                domain["id"], previous_start, previous_end
            ),
            await session_service.count_by_domain(
                domain["id"], current_start, current_end
            ),
            await session_service.count_by_domain(
                domain["id"], previous_start, previous_end
            ),
            await session_service.get_bounce_rate(
                domain["id"], current_start, current_end
            ),
            await session_service.get_bounce_rate(
                domain["id"], previous_start, previous_end
            ),
            await session_service.get_avg_duration(
                domain["id"], current_start, current_end
            ),
            await session_service.get_avg_duration(
                domain["id"], previous_start, previous_end
            ),
        )

        period = {
            "current": {"start": current_start, "end": current_end},
            "previous": {"start": previous_start, "end": previous_end},
        }

        api_key = get_settings().GEMINI_API_KEY
        if api_key:
            try:
                ai_insights = await _generate_ai_insights(
                    api_key,
                    current_pageviews=current_pageviews,
                    previous_pageviews=previous_pageviews,
                    current_visitors=current_visitors,
                    previous_visitors=previous_visitors,
                    current_sessions=current_sessions,
                    previous_sessions=previous_sessions,
                    current_bounce_rate=current_bounce_rate,
                    previous_bounce_rate=previous_bounce_rate,
                    current_avg_duration=current_avg_duration,
                    previous_avg_duration=previous_avg_duration,
                )
                if ai_insights is not None:
                    generated_at = datetime.now(UTC)
                    return jsjson(
                        {
                            "insights": [
                                {"id": str(uuid4()), **item, "createdAt": generated_at}
                                for item in ai_insights
                            ],
                            "period": period,
                            "generatedAt": generated_at,
                            "aiGenerated": True,
                        }
                    )
            except Exception as exc:
                log.error(f"Gemini error, falling back to basic insights: {exc}")

        # ── Deterministic fallback insights ──
        fallback: list[dict] = []
        created_at = datetime.now(UTC)

        pv_change = _percent_change(current_pageviews, previous_pageviews)
        if abs(pv_change) >= 10:
            fallback.append(
                {
                    "id": str(uuid4()),
                    "type": "trend" if pv_change > 0 else "warning",
                    "priority": "high" if abs(pv_change) > 50 else "medium",
                    "title": "Traffic is growing" if pv_change > 0 else "Traffic is declining",
                    "description": (
                        f"Pageviews {'increased' if pv_change > 0 else 'decreased'} by "
                        f"{abs(pv_change)}% compared to the previous week."
                    ),
                    "metric": "pageviews",
                    "value": current_pageviews,
                    "change": pv_change,
                    "recommendation": (
                        "Investigate potential causes — check for technical issues, "
                        "content changes, or SEO ranking drops."
                        if pv_change < 0
                        else "Great momentum! Consider doubling down on what's working."
                    ),
                    "createdAt": created_at,
                }
            )

        visitor_change = _percent_change(current_visitors, previous_visitors)
        if abs(visitor_change) >= 15:
            fallback.append(
                {
                    "id": str(uuid4()),
                    "type": "opportunity" if visitor_change > 0 else "anomaly",
                    "priority": "medium",
                    "title": (
                        "New visitor surge"
                        if visitor_change > 0
                        else "Fewer unique visitors"
                    ),
                    "description": (
                        f"Unique visitors {'grew' if visitor_change > 0 else 'dropped'} "
                        f"by {abs(visitor_change)}%."
                    ),
                    "metric": "visitors",
                    "value": current_visitors,
                    "change": visitor_change,
                    "createdAt": created_at,
                }
            )

        if current_bounce_rate > 70:
            fallback.append(
                {
                    "id": str(uuid4()),
                    "type": "performance",
                    "priority": "high",
                    "title": "High bounce rate detected",
                    "description": (
                        f"Your bounce rate is {current_bounce_rate}%, which is above "
                        "the recommended threshold."
                    ),
                    "metric": "bounceRate",
                    "value": f"{current_bounce_rate}%",
                    "change": _percent_change(current_bounce_rate, previous_bounce_rate),
                    "recommendation": (
                        "Improve page load speed, review landing page content, and "
                        "ensure your CTAs are compelling."
                    ),
                    "createdAt": created_at,
                }
            )

        if current_avg_duration < 30 and current_sessions > 0:
            fallback.append(
                {
                    "id": str(uuid4()),
                    "type": "performance",
                    "priority": "medium",
                    "title": "Low session duration",
                    "description": (
                        f"Average session is only {current_avg_duration} seconds. "
                        "Visitors may not be finding what they need."
                    ),
                    "metric": "avgSessionDuration",
                    "value": f"{current_avg_duration}s",
                    "change": _percent_change(current_avg_duration, previous_avg_duration),
                    "recommendation": (
                        "Add more engaging content, improve navigation, and consider "
                        "internal linking."
                    ),
                    "createdAt": created_at,
                }
            )

        if not fallback:
            fallback.append(
                {
                    "id": str(uuid4()),
                    "type": "trend",
                    "priority": "low",
                    "title": "Steady performance",
                    "description": (
                        "Your metrics are stable this week. No significant changes detected."
                    ),
                    "metric": "overall",
                    "value": "stable",
                    "createdAt": created_at,
                }
            )

        return jsjson(
            {
                "insights": fallback,
                "period": period,
                "generatedAt": created_at,
                "aiGenerated": False,
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Insights error: {exc}")
        raise SimpleError(FAILED_INSIGHTS, 500) from None


async def _generate_ai_insights(
    api_key: str,
    *,
    current_pageviews: int,
    previous_pageviews: int,
    current_visitors: int,
    previous_visitors: int,
    current_sessions: int,
    previous_sessions: int,
    current_bounce_rate: float,
    previous_bounce_rate: float,
    current_avg_duration: int,
    previous_avg_duration: int,
) -> list[dict] | None:
    """Call Gemini through its REST endpoint; return None to signal a fallback."""
    prompt = f"""You are an expert web analytics AI. I will provide you with analytics data
for the past 7 days compared to the previous 7 days.
Please analyze this data and return exactly 3 insightful recommendations in JSON array format.
Each insight MUST match this interface exactly:
{{
    "type": "trend" | "anomaly" | "performance" | "opportunity" | "warning",
    "priority": "high" | "medium" | "low",
    "title": "Short catchy title",
    "description": "Clear explanation of what happened",
    "metric": "Which metric this relates to e.g. 'pageviews', 'bounceRate', 'avgSessionDuration'",
    "recommendation": "Actionable advice on what to do"
}}

Data for last 7 days vs previous 7 days:
- Pageviews: {current_pageviews} (was {previous_pageviews})
- Unique Visitors: {current_visitors} (was {previous_visitors})
- Sessions: {current_sessions} (was {previous_sessions})
- Bounce Rate: {current_bounce_rate}% (was {previous_bounce_rate}%)
- Avg Session Duration: {current_avg_duration}s (was {previous_avg_duration}s)

Return ONLY a valid JSON array, do not include markdown blocks."""

    async with httpx.AsyncClient(timeout=GEMINI_TIMEOUT_SECONDS) as client:
        response = await client.post(
            GEMINI_ENDPOINT.format(model=GEMINI_MODEL),
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.7,
                },
            },
        )
        response.raise_for_status()
        payload = response.json()

    text = (
        payload.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text")
    ) or "[]"

    parsed = json.loads(text)
    if not isinstance(parsed, list):
        return None
    return [item for item in parsed if isinstance(item, dict)]
