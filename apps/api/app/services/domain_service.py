"""Domain data access — port of `services/domainService.ts` (raw SQL preserved).

`get_by_tracking_id` uses the raw Redis client rather than the JSON cache helper,
because the Express version calls `redisClient.get`/`setex` with manual
`JSON.parse`/`JSON.stringify` and a 300-second TTL.
"""

from __future__ import annotations

import json
from typing import Any

from ..db import query, query_one
from ..logging import create_logger
from ..redis_client import get_client

log = create_logger("DomainService")

TRACKING_CACHE_TTL_SECONDS = 300  # 5 minutes


async def create(
    user_id: str, domain: str, name: str, tracking_id: str
) -> dict[str, Any] | None:
    rows = await query(
        """
        INSERT INTO domains (user_id, domain, name, tracking_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        """,
        user_id,
        domain,
        name,
        tracking_id,
    )
    return rows[0] if rows else None


async def list_by_user(user_id: str) -> list[dict[str, Any]]:
    """Domains the user owns or was invited to, with the owner's plan attached."""
    return await query(
        """
        WITH user_domains AS (
            SELECT * FROM domains WHERE user_id = $1
            UNION
            SELECT d.* FROM domains d
            JOIN domain_members dm ON d.id = dm.domain_id
            WHERE dm.user_id = $1
        )
        SELECT ud.*,
           COALESCE(
               (SELECT plan FROM subscriptions s
                WHERE s.user_id = ud.user_id AND status = 'active'
                ORDER BY created_at DESC LIMIT 1),
               'free'
           ) as owner_plan
        FROM user_domains ud
        ORDER BY ud.created_at DESC
        """,
        user_id,
    )


async def get_by_id(domain_id: str) -> dict[str, Any] | None:
    return await query_one("SELECT * FROM domains WHERE id = $1", domain_id)


def is_owner(domain: dict[str, Any] | None, user_id: str) -> bool:
    """`domain.user_id !== req.userId`, with UUID/string normalisation.

    asyncpg returns UUID columns as `uuid.UUID` objects, whereas node-postgres
    hands back plain strings. Comparing the two types directly always reports
    "not equal", so every ownership check would 404 — including for the real
    owner. Normalising both sides to `str` restores Express's behaviour.
    """
    if not domain:
        return False
    return str(domain.get("user_id") or "") == str(user_id)


async def has_access(domain_id: str, user_id: str) -> bool:
    row = await query_one(
        """
        SELECT 1 FROM domains WHERE id = $1 AND user_id = $2
        UNION
        SELECT 1 FROM domain_members WHERE domain_id = $1 AND user_id = $2
        """,
        domain_id,
        user_id,
    )
    return row is not None


async def get_by_tracking_id(tracking_id: str) -> dict[str, Any] | None:
    cache_key = f"domain:tracking:{tracking_id}"
    client = get_client()

    if client is not None:
        try:
            cached = await client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass  # ignore cache read errors

    domain = await query_one("SELECT * FROM domains WHERE tracking_id = $1", tracking_id)

    if domain and client is not None:
        try:
            await client.setex(
                cache_key, TRACKING_CACHE_TTL_SECONDS, json.dumps(domain, default=str)
            )
        except Exception:
            pass  # ignore cache write errors

    return domain


async def verify(domain_id: str) -> dict[str, Any] | None:
    return await query_one(
        "UPDATE domains SET verified = true WHERE id = $1 RETURNING *", domain_id
    )


async def remove(domain_id: str) -> None:
    await query("DELETE FROM domains WHERE id = $1", domain_id)


async def count_by_user(user_id: str) -> int:
    row = await query_one(
        "SELECT COUNT(*)::text as count FROM domains WHERE user_id = $1", user_id
    )
    return int((row or {}).get("count") or "0")
