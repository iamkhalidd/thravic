"""AI usage: how often the model is called, by which feature and account, and
roughly what it costs.

Every call is a row in `ai_usage` (see `services/ai_usage_service.py`). The cost
is an estimate: tokens times `AI_PRICE_INPUT_PER_M` / `AI_PRICE_OUTPUT_PER_M`,
without the provider's cache discounts, so the real bill is usually lower.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from ...config import get_settings
from ...db import query, query_one
from ...errors import SimpleError
from ...json_response import jsjson
from ...logging import create_logger

log = create_logger("Admin:AI")

router = APIRouter()

DEFAULT_DAYS = 30
MAX_DAYS = 365
TOP_ACCOUNTS = 20

_SUMS = """
COUNT(*)::int AS calls,
COUNT(*) FILTER (WHERE NOT ok)::int AS failed,
COALESCE(SUM(prompt_tokens), 0)::bigint::float8 AS prompt_tokens,
COALESCE(SUM(completion_tokens), 0)::bigint::float8 AS completion_tokens
"""


def _days(request: Request) -> int:
    try:
        days = int(request.query_params.get("days") or DEFAULT_DAYS)
    except ValueError:
        days = DEFAULT_DAYS
    return max(1, min(days, MAX_DAYS))


def cost(prompt_tokens: float, completion_tokens: float) -> float:
    """Estimated US dollars for that many tokens at the configured prices."""
    settings = get_settings()
    return round(
        (prompt_tokens * settings.AI_PRICE_INPUT_PER_M
         + completion_tokens * settings.AI_PRICE_OUTPUT_PER_M) / 1_000_000,
        4,
    )


def _with_cost(row: dict) -> dict:
    return {**row, "cost": cost(row["prompt_tokens"], row["completion_tokens"])}


@router.get("")
@router.get("/")
async def ai_usage(request: Request):
    days = _days(request)
    since = "created_at >= NOW() - make_interval(days => $1)"
    try:
        totals = await query_one(f"SELECT {_SUMS} FROM ai_usage WHERE {since}", days)
        daily = await query(
            f"""
            SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
                   {_SUMS}
            FROM ai_usage WHERE {since}
            GROUP BY 1 ORDER BY 1
            """,
            days,
        )
        features = await query(
            f"""
            SELECT feature, {_SUMS} FROM ai_usage WHERE {since}
            GROUP BY feature ORDER BY calls DESC
            """,
            days,
        )
        accounts = await query(
            f"""
            SELECT a.user_id, u.email, COALESCE(NULLIF(u.name, ''), u.email) AS name,
                   u.subscription AS plan, {_SUMS}
            FROM ai_usage a
            JOIN users u ON u.id = a.user_id
            WHERE a.{since}
            GROUP BY a.user_id, u.email, u.name, u.subscription
            ORDER BY SUM(a.prompt_tokens + a.completion_tokens) DESC
            LIMIT $2
            """,
            days,
            TOP_ACCOUNTS,
        )
        settings = get_settings()
        return jsjson(
            {
                "days": days,
                "configured": bool(settings.AI_API_KEY),
                "model": settings.AI_MODEL,
                "prices": {
                    "inputPerM": settings.AI_PRICE_INPUT_PER_M,
                    "outputPerM": settings.AI_PRICE_OUTPUT_PER_M,
                },
                "totals": _with_cost(totals or {"calls": 0, "failed": 0, "prompt_tokens": 0.0,
                                                 "completion_tokens": 0.0}),
                "daily": [_with_cost(row) for row in daily],
                "features": [_with_cost(row) for row in features],
                "accounts": [_with_cost(row) for row in accounts],
            }
        )
    except Exception as exc:  # noqa: BLE001
        log.error(f"AI usage error: {exc}")
        raise SimpleError("Failed to load AI usage", 500) from None
