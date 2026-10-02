"""Redis connection lifecycle — graceful degradation, mirroring `cacheService.ts`.

If `REDIS_URL` is unset or the connection fails, every helper becomes a no-op
rather than raising. The Express backend behaves the same way, so the API stays
functional (just uncached) without Redis.
"""

from __future__ import annotations

import asyncio

import redis.asyncio as aioredis

from .config import get_settings
from .logging import create_logger

log = create_logger("Redis")

_client: aioredis.Redis | None = None
_connected = False

CONNECT_TIMEOUT_SECONDS = 5


async def init_redis() -> None:
    """Open the connection, abandoning it quietly if Redis is unavailable."""
    global _client, _connected

    url = get_settings().REDIS_URL
    if not url:
        log.warning("REDIS_URL not set — caching disabled")
        return

    try:
        client = aioredis.from_url(url, decode_responses=True)
        await asyncio.wait_for(client.ping(), timeout=CONNECT_TIMEOUT_SECONDS)
        _client = client
        _connected = True
        log.info("Redis connected")
    except Exception as exc:
        log.warning(f"Redis connection failed — caching disabled: {exc}")
        _client = None
        _connected = False


async def close_redis() -> None:
    global _client, _connected
    if _client is not None and _connected:
        await _client.aclose()
    _client = None
    _connected = False


def get_client() -> aioredis.Redis | None:
    """The live client, or `None` when Redis is unavailable."""
    return _client if _connected else None


def is_connected() -> bool:
    return _connected
