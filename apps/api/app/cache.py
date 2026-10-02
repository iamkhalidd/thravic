"""JSON cache helpers — port of `cacheService.ts`.

Every function degrades to a no-op when Redis is unavailable, matching the
Express behaviour. Values are JSON-encoded on the way in and decoded on the way
out, exactly as the TS implementation does.

`delete()` is named for Python's reserved word (`del` in TypeScript), and there
is an extra `increment_with_ttl()` used by the rate limiters, which needs atomic
INCR semantics that plain get/set cannot provide.
"""

from __future__ import annotations

import json
from typing import Any

from .logging import create_logger
from .redis_client import get_client

log = create_logger("Cache")


async def get(key: str) -> Any | None:
    """Return the cached value, or `None` on a miss / when Redis is unavailable."""
    client = get_client()
    if client is None:
        return None
    try:
        raw = await client.get(key)
        return json.loads(raw) if raw is not None else None
    except Exception:
        return None


async def set(key: str, value: Any, ttl_seconds: int) -> None:  # noqa: A001 - mirrors TS name
    """Cache a JSON-encoded value for `ttl_seconds`. Silently fails."""
    client = get_client()
    if client is None:
        return
    try:
        await client.set(key, json.dumps(value), ex=ttl_seconds)
    except Exception:
        # Cache is non-critical — never let it break a request
        pass


async def delete(key: str) -> None:
    """Remove a cached value. Equivalent of the TS `del()`."""
    client = get_client()
    if client is None:
        return
    try:
        await client.delete(key)
    except Exception:
        pass


async def invalidate_pattern(pattern: str) -> None:
    """Delete every key matching a glob pattern (e.g. `domain:abc123:*`)."""
    client = get_client()
    if client is None:
        return
    try:
        keys: list[str] = []
        async for key in client.scan_iter(match=pattern, count=500):
            keys.append(key)
        if keys:
            await client.delete(*keys)
    except Exception:
        pass


# Increment and set the window expiry in one server-side script, the same way
# `rate-limit-redis` does. Two reasons this is not a MULTI/EXEC pipeline:
#
#   1. `INCR` and `PEXPIRE` must be atomic, or a counter can be created without a
#      TTL and the window becomes permanent.
#   2. The previous pipeline form raised
#      `ResponseError: Wrong number of response items from pipeline execution`
#      under redis-py 8.1.0. Because the handler below swallowed every exception
#      and returned `None`, every rate limiter silently stopped rejecting anything
#      — the counters still incremented, so it looked healthy from Redis.
_INCREMENT_SCRIPT = """
local current = redis.call('INCR', KEYS[1])
if tonumber(current) == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return {current, redis.call('PTTL', KEYS[1])}
"""


async def increment_with_ttl(key: str, ttl_seconds: int) -> tuple[int, int] | None:
    """Atomically increment a counter, setting the window TTL on first write.

    Returns `(count, remaining_ttl_seconds)`, or `None` if Redis is unavailable or
    the operation failed — callers then skip the rule, which is the graceful
    degradation the Express limiters have. A failure is logged rather than
    swallowed, so a broken limiter is visible instead of silently inert.
    """
    client = get_client()
    if client is None:
        return None
    try:
        count, ttl_ms = await client.eval(
            _INCREMENT_SCRIPT, 1, key, max(int(ttl_seconds), 1) * 1000
        )
    except Exception as exc:
        log.error(f"increment_with_ttl failed for {key}: {exc}")
        return None

    # `RateLimit-Reset` is whole seconds until the window closes, rounded up, so
    # a sub-second remainder never reports 0 while the window is still open.
    remaining = max(-(-int(ttl_ms) // 1000), 0)
    return int(count), remaining
