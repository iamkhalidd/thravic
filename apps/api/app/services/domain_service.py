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

# Tracking settings a domain has when it has not overridden them. Recording is off
# by default, as in the tracker; `domains.settings` stores only overrides.
DEFAULT_SETTINGS: dict[str, bool | int] = {
    "trackClicks": True,
    "trackScrolls": True,
    "trackForms": True,
    "sessionRecording": False,
    # Ask each visitor before recording (the tracker's own prompt). Off only when
    # the site collects consent itself and calls TF('grantConsent').
    "recordingConsentPrompt": True,
    # Share of visits recorded, in percent; the tracker decides once per visit.
    "recordingSampleRate": 100,
    # Recordings started per UTC day, enforced at /recording/start. Each one is
    # stored for the plan's retention, so this is what bounds recording storage.
    "recordingDailyLimit": 50,
}

# Values the numeric settings may take (the dashboard offers exactly these).
SETTING_CHOICES: dict[str, tuple[int, ...]] = {
    "recordingSampleRate": (100, 50, 25, 10),
    "recordingDailyLimit": (25, 50, 100, 250, 500, 1000),
}

# Event types each setting switches off at collection.
EVENT_TYPE_SETTINGS = {"click": "trackClicks", "scroll": "trackScrolls", "form": "trackForms"}


def effective_settings(domain: dict[str, Any]) -> dict[str, bool | int]:
    """The domain's stored overrides on top of the defaults.

    A stored value that is no longer one of a numeric setting's choices falls
    back to the default rather than reaching the collector.
    """
    stored = domain.get("settings") or {}
    settings: dict[str, bool | int] = {}
    for key, default in DEFAULT_SETTINGS.items():
        value = stored.get(key, default)
        if key in SETTING_CHOICES:
            settings[key] = value if value in SETTING_CHOICES[key] else default
        else:
            settings[key] = bool(value)
    return settings


def collects(domain: dict[str, Any], event_type: str) -> bool:
    """Whether events of `event_type` are stored for this domain."""
    setting = EVENT_TYPE_SETTINGS.get(event_type)
    return setting is None or effective_settings(domain)[setting]


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


async def update_settings(
    domain_id: str, changes: dict[str, bool | int]
) -> dict[str, Any] | None:
    """Merge `changes` into the stored settings and drop the cached tracking lookup,
    so the collector applies them on the next request rather than in 5 minutes."""
    domain = await query_one(
        "UPDATE domains SET settings = settings || $2::jsonb WHERE id = $1 RETURNING *",
        domain_id,
        changes,  # the connection's jsonb codec encodes it
    )
    if domain:
        await _forget_tracking_lookup(domain["tracking_id"])
    return domain


async def _forget_tracking_lookup(tracking_id: str) -> None:
    client = get_client()
    if client is None:
        return
    try:
        await client.delete(f"domain:tracking:{tracking_id}")
    except Exception:
        pass  # the entry expires on its own within TRACKING_CACHE_TTL_SECONDS


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
