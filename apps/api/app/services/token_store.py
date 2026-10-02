"""Refresh-token store — port of `services/tokenStore.ts`.

Redis-backed with an in-memory fallback so development works without Redis. The
key prefix and 7-day TTL match the TS implementation, which means refresh tokens
issued by the Express backend remain valid here (both write `rt:<token>`).
"""

from __future__ import annotations

from .. import cache

REFRESH_TOKEN_PREFIX = "rt:"
REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days

# Fallback when Redis is unavailable
_memory_store: set[str] = set()


async def store_refresh_token(token: str) -> None:
    await cache.set(f"{REFRESH_TOKEN_PREFIX}{token}", "1", REFRESH_TOKEN_TTL_SECONDS)
    _memory_store.add(token)


async def has_refresh_token(token: str) -> bool:
    cached = await cache.get(f"{REFRESH_TOKEN_PREFIX}{token}")
    if cached is not None:
        return True
    return token in _memory_store


async def remove_refresh_token(token: str) -> None:
    await cache.delete(f"{REFRESH_TOKEN_PREFIX}{token}")
    _memory_store.discard(token)


async def revoke_all_user_tokens(user_id: str) -> None:
    """Force logout everywhere. Redis only — the memory store has no user index."""
    await cache.invalidate_pattern(f"{REFRESH_TOKEN_PREFIX}*:{user_id}")


def clear_memory_store() -> None:
    """Drop the in-memory fallback (used by tests)."""
    _memory_store.clear()
