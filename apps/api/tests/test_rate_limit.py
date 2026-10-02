"""Rate limiter behaviour — deliberately not covered by HTTP-level parity checks.

The old Express backend keyed its counters on `::ffff:127.0.0.1` while FastAPI
sees `127.0.0.1`: the two counters advanced independently, so a comparison run
long enough to trip one limiter made *both* backends answer an identical 429 and
the spec would "pass" without the handler ever running. Redis was flushed between
specs to keep that from happening, which meant the limiter was never exercised.

So the limiter is verified here instead, directly against the middleware, with no
dependency on how either server formats a client address.

This file also guards a real regression: `cache.increment_with_ttl` used a
MULTI/EXEC pipeline that raised under redis-py 8.1.0, and because the error was
swallowed every limiter silently stopped rejecting anything while its Redis
counter kept climbing. A test that only looked at Redis would have passed.
"""

from __future__ import annotations

import os

import pytest
from starlette.responses import Response

from app import cache
from app.middleware.rate_limit import RateLimitMiddleware, default_rules
from app.redis_client import init_redis


class _FakeClient:
    host = "127.0.0.1"


class _FakeRequest:
    """Just enough of a Starlette Request for the middleware's needs."""

    def __init__(self, path: str, ip: str = "127.0.0.1") -> None:
        self.url = type("U", (), {"path": path})()
        self.headers: dict[str, str] = {}
        self.client = type("C", (), {"host": ip})()


async def _ok(_request) -> Response:
    return Response("ok", status_code=200)


@pytest.fixture(autouse=True)
async def _redis():
    if not os.getenv("REDIS_URL"):
        pytest.skip("REDIS_URL not set")
    await init_redis()
    client = cache.get_client()
    if client is None:
        pytest.skip("Redis unavailable")
    try:
        await client.ping()
    except Exception:
        pytest.skip("Redis unavailable")
    yield
    await client.flushdb()


async def test_increment_with_ttl_actually_increments_and_sets_a_window():
    """The regression: this used to increment the key but return None."""
    await cache.get_client().delete("rl:test:incr")
    first = await cache.increment_with_ttl("rl:test:incr", 60)
    second = await cache.increment_with_ttl("rl:test:incr", 60)
    ttl = await cache.get_client().ttl("rl:test:incr")

    assert first is not None, "increment_with_ttl returned None — the limiter is inert"
    assert second is not None
    assert first[0] == 1
    assert second[0] == 2
    # The window must be set on the first write, or the bucket never expires.
    assert 0 < ttl <= 60


async def test_admin_rule_rejects_only_after_its_limit():
    middleware = RateLimitMiddleware(app=None)
    rule = next(r for r in default_rules() if r.name == "admin")

    for attempt in range(1, rule.max_requests + 1):
        response = await middleware.dispatch(_FakeRequest("/api/admin/users"), _ok)
        assert response.status_code == 200, f"rejected too early on attempt {attempt}"

    response = await middleware.dispatch(_FakeRequest("/api/admin/users"), _ok)
    assert response.status_code == 429
    assert response.body == b'{"error":"Too many admin requests, please slow down."}'
    assert response.headers["ratelimit-limit"] == str(rule.max_requests)
    assert response.headers["ratelimit-remaining"] == "0"


async def test_admin_rule_counts_a_different_ip_separately():
    middleware = RateLimitMiddleware(app=None)

    for _ in range(35):
        await middleware.dispatch(_FakeRequest("/api/admin/users", ip="10.0.0.1"), _ok)

    # A different caller must still be served.
    response = await middleware.dispatch(_FakeRequest("/api/admin/users", ip="10.0.0.2"), _ok)
    assert response.status_code == 200


async def test_non_admin_paths_are_not_counted_by_the_admin_rule():
    client = cache.get_client()
    middleware = RateLimitMiddleware(app=None)

    await middleware.dispatch(_FakeRequest("/api/domains"), _ok)

    assert await client.get("rl:admin:127.0.0.1") is None
    assert await client.get("rl:global:127.0.0.1") == "1"


async def test_auth_rule_matches_only_its_exact_paths():
    """`/api/auth/me` is deliberately unlimited — only login/register/forgot are."""
    rule = next(r for r in default_rules() if r.name == "auth")
    assert rule.matches("/api/auth/login")
    assert rule.matches("/api/auth/register")
    assert rule.matches("/api/auth/forgot-password")
    assert not rule.matches("/api/auth/me")
    assert not rule.matches("/api/auth/reset-password")


async def test_collect_is_exempt_from_the_global_rule():
    """The global limiter skips `/api/collect`, which has its own 60/min bucket."""
    global_rule = next(r for r in default_rules() if r.name == "global")
    assert not global_rule.matches("/api/collect/TF-PARITY01")
    assert global_rule.matches("/api/domains")
