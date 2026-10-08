"""User data access — port of `services/userService.ts` (raw SQL preserved verbatim)."""

from __future__ import annotations

from datetime import date
from typing import Any

from ..db import query, query_one

# Free-plan defaults applied on signup, matching the TS implementation
_FREE_PLAN_EVENTS_LIMIT = 5_000
_FREE_PLAN_DOMAINS_LIMIT = 1


async def _ensure_free_subscription(user_id: str) -> None:
    """Auto-create a free subscription row so billing/admin pages show the user."""
    try:
        await query(
            """
            INSERT INTO subscriptions (user_id, plan, status, events_limit, domains_limit)
            VALUES ($1, 'free', 'active', $2, $3)
            ON CONFLICT (user_id) DO NOTHING
            """,
            user_id,
            _FREE_PLAN_EVENTS_LIMIT,
            _FREE_PLAN_DOMAINS_LIMIT,
        )
    except Exception:
        # Non-fatal, exactly as in the TS implementation
        pass


# ── Create user (email + password) ───────────────────────────────────────────


async def create_user(
    email: str,
    password: str,
    name: str,
    date_of_birth: date | None = None,
    country: str | None = None,
    phone: str | None = None,
) -> dict[str, Any] | None:
    row = await query_one(
        """
        INSERT INTO users (email, password, name, preferences, date_of_birth, country, phone)
        VALUES ($1, $2, $3, '{}', $4, $5, $6)
        RETURNING *
        """,
        email,
        password,
        name,
        date_of_birth,
        country,
        phone,
    )
    if row:
        await _ensure_free_subscription(row["id"])
    return row


# ── Create OAuth user (no password) ──────────────────────────────────────────


async def create_oauth_user(
    email: str,
    name: str,
    provider: str,
    provider_id: str,
    avatar_url: str | None = None,
) -> dict[str, Any] | None:
    row = await query_one(
        """
        INSERT INTO users (email, name, auth_provider, auth_provider_id, avatar_url, preferences)
        VALUES ($1, $2, $3, $4, $5, '{}')
        RETURNING *
        """,
        email,
        name,
        provider,
        provider_id,
        avatar_url or None,
    )
    if row:
        await _ensure_free_subscription(row["id"])
    return row


# ── Lookups ──────────────────────────────────────────────────────────────────


async def find_by_oauth_id(provider: str, provider_id: str) -> dict[str, Any] | None:
    return await query_one(
        "SELECT * FROM users WHERE auth_provider = $1 AND auth_provider_id = $2",
        provider,
        provider_id,
    )


async def find_by_email(email: str) -> dict[str, Any] | None:
    return await query_one("SELECT * FROM users WHERE email = $1", email)


async def find_by_id(user_id: str) -> dict[str, Any] | None:
    return await query_one("SELECT * FROM users WHERE id = $1", user_id)


# ── Mutations ────────────────────────────────────────────────────────────────


async def link_oauth(
    user_id: str,
    provider: str,
    provider_id: str,
    avatar_url: str | None = None,
) -> dict[str, Any] | None:
    return await query_one(
        """
        UPDATE users
        SET auth_provider = $2,
            auth_provider_id = $3,
            avatar_url = COALESCE(avatar_url, $4),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        """,
        user_id,
        provider,
        provider_id,
        avatar_url or None,
    )


async def update_password(user_id: str, hashed_password: str) -> None:
    await query(
        "UPDATE users SET password = $2, updated_at = NOW() WHERE id = $1",
        user_id,
        hashed_password,
    )


async def update_subscription(
    user_id: str,
    subscription: str,
    paystack_customer_code: str | None = None,
    paystack_subscription_code: str | None = None,
) -> dict[str, Any] | None:
    return await query_one(
        """
        UPDATE users
        SET subscription = $2,
            paystack_customer_code = COALESCE($3, paystack_customer_code),
            paystack_subscription_code = COALESCE($4, paystack_subscription_code),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        """,
        user_id,
        subscription,
        paystack_customer_code or None,
        paystack_subscription_code or None,
    )


async def update_preferences(
    user_id: str, preferences: dict[str, Any]
) -> dict[str, Any] | None:
    # `preferences` is passed as a dict — the jsonb codec serializes it.
    return await query_one(
        """
        UPDATE users
        SET preferences = $2,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        """,
        user_id,
        preferences,
    )


_PROFILE_COLUMNS = (
    "name",
    "date_of_birth",
    "company",
    "job_title",
    "website",
    "phone",
    "country",
    "timezone",
)


async def update_profile(
    user_id: str, fields: dict[str, Any]
) -> dict[str, Any] | None:
    """Build a partial UPDATE from whichever profile fields were supplied.

    Presence is checked with `in`, mirroring Express's `!== undefined`: sending an
    explicit `null` still writes NULL, whereas a missing key is left untouched.
    """
    sets: list[str] = []
    values: list[Any] = []
    index = 1

    for column in _PROFILE_COLUMNS:
        if column in fields:
            sets.append(f"{column} = ${index}")
            values.append(fields[column])
            index += 1

    if not sets:
        return await find_by_id(user_id)

    sets.append("updated_at = NOW()")
    values.append(user_id)

    return await query_one(
        f"UPDATE users SET {', '.join(sets)} WHERE id = ${index} RETURNING *",
        *values,
    )


async def update_avatar(user_id: str, avatar_url: str | None) -> dict[str, Any] | None:
    return await query_one(
        "UPDATE users SET avatar_url = $2, updated_at = NOW() WHERE id = $1 RETURNING *",
        user_id,
        avatar_url,
    )
