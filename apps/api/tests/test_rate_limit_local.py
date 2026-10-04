"""The in-process rate-limit fallback — what happens with no Redis.

Redis is blank in normal operation, and the limiter used to `continue` on every
rule when `increment_with_ttl` returned `None`. That left `/api/collect` — a
public, unauthenticated endpoint that now writes to Postgres on every request —
completely unthrottled.

These run with the Redis path forced to return `None`, so they do not need a
server, and `test_rate_limit.py` keeps covering the Redis path.
"""

from __future__ import annotations

import json

import pytest
from starlette.responses import Response

from app import cache
from app.middleware.rate_limit import (
    LOCAL_WINDOWS,
    LocalWindowCounter,
    RateLimitMiddleware,
    RateLimitRule,
    default_rules,
    reset_local_windows,
)


class _FakeRequest:
    """Just enough of a Starlette Request for the middleware's needs."""

    def __init__(self, path: str, ip: str = "127.0.0.1") -> None:
        self.url = type("U", (), {"path": path})()
        self.headers: dict[str, str] = {}
        self.client = type("C", (), {"host": ip})()


class _Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def monotonic(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


async def _ok(_request) -> Response:
    return Response("ok", status_code=200)


@pytest.fixture(autouse=True)
def _redis_unavailable(monkeypatch):
    """Force the Redis path to report nothing, so the fallback is exercised."""

    async def _unavailable(_key: str, _ttl: int):
        return None

    monkeypatch.setattr(cache, "increment_with_ttl", _unavailable)
    reset_local_windows()
    yield
    reset_local_windows()


# ── Middleware behaviour ─────────────────────────────────────────────────────


async def test_the_collect_rule_is_enforced_without_redis():
    middleware = RateLimitMiddleware(app=None)
    rule = next(r for r in default_rules() if r.name == "collect")

    for attempt in range(1, rule.max_requests + 1):
        response = await middleware.dispatch(_FakeRequest("/api/collect/trk_demo"), _ok)
        assert response.status_code == 200, f"rejected too early on attempt {attempt}"

    response = await middleware.dispatch(_FakeRequest("/api/collect/trk_demo"), _ok)

    assert response.status_code == 429
    assert json.loads(response.body) == {"error": rule.message}
    assert response.headers["ratelimit-limit"] == str(rule.max_requests)


async def test_auth_rule_still_protects_login_without_redis():
    middleware = RateLimitMiddleware(app=None)
    rule = next(r for r in default_rules() if r.name == "auth")

    for _ in range(rule.max_requests):
        await middleware.dispatch(_FakeRequest("/api/auth/login"), _ok)

    response = await middleware.dispatch(_FakeRequest("/api/auth/login"), _ok)
    assert response.status_code == 429


async def test_counters_are_per_client():
    middleware = RateLimitMiddleware(app=None)
    rule = next(r for r in default_rules() if r.name == "collect")

    for _ in range(rule.max_requests + 1):
        await middleware.dispatch(_FakeRequest("/api/collect/x", ip="10.0.0.1"), _ok)

    # A different caller must still be served.
    response = await middleware.dispatch(_FakeRequest("/api/collect/x", ip="10.0.0.2"), _ok)
    assert response.status_code == 200


async def test_unmatched_paths_are_not_counted():
    middleware = RateLimitMiddleware(app=None)

    for _ in range(50):
        response = await middleware.dispatch(_FakeRequest("/health"), _ok)
        assert response.status_code == 200

    assert LOCAL_WINDOWS.size() == 0


async def test_every_matching_rule_counts_a_request():
    """`/api/domains` matches the global rule only; login matches global + auth."""
    middleware = RateLimitMiddleware(app=None)

    await middleware.dispatch(_FakeRequest("/api/domains"), _ok)
    assert LOCAL_WINDOWS.size() == 1

    reset_local_windows()
    await middleware.dispatch(_FakeRequest("/api/auth/login"), _ok)
    assert LOCAL_WINDOWS.size() == 2


# ── The counter itself ───────────────────────────────────────────────────────


def test_the_window_expires_after_its_seconds():
    clock = _Clock()
    counter = LocalWindowCounter(clock=clock.monotonic)

    assert counter.increment("k", 60) == (1, 60)
    assert counter.increment("k", 60)[0] == 2

    clock.advance(60)

    # A fresh window starts, and the reported remainder resets with it.
    assert counter.increment("k", 60) == (1, 60)


async def test_a_custom_rule_set_is_honoured():
    rule = RateLimitRule(
        name="tiny",
        prefix="rl:tiny:",
        window_ms=60_000,
        max_requests=2,
        message="nope",
        path_prefix="/api/",
    )
    middleware = RateLimitMiddleware(app=None, rules=[rule])

    for _ in range(2):
        response = await middleware.dispatch(_FakeRequest("/api/anything"), _ok)
        assert response.status_code == 200

    response = await middleware.dispatch(_FakeRequest("/api/anything"), _ok)
    assert response.status_code == 429
    assert json.loads(response.body) == {"error": "nope"}


async def test_memory_is_bounded_even_when_nothing_expires():
    """A flood of distinct keys must not grow the dict without bound."""
    clock = _Clock()
    counter = LocalWindowCounter(max_keys=10, clock=clock.monotonic)

    for index in range(100):
        counter.increment(f"key-{index}", 600)

    assert counter.size() <= 10


def test_sweeping_drops_expired_keys_first():
    clock = _Clock()
    counter = LocalWindowCounter(max_keys=5, clock=clock.monotonic)

    for index in range(5):
        counter.increment(f"key-{index}", 60)
    assert counter.size() == 5

    clock.advance(60)
    counter.increment("fresh", 60)

    # The next insert tipped it over the budget, dropping the five expired ones.
    assert counter.size() == 1
