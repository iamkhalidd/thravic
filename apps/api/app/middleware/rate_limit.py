"""Rate limiting — mirrors the four Express `express-rate-limit` tiers.

Express registers several limiters, and a request can be counted by more than one
(for example `/api/auth/login` is matched by both the global and the auth
limiter). This middleware evaluates every matching rule in registration order and
rejects on the first breach, so thresholds behave identically.

Redis is used for counters, with the same key prefixes as the Express limiters, so
existing buckets carry over across the cutover. When Redis is unavailable the
counter falls back to a per-process window (`LocalWindowCounter`) instead of being
skipped: Redis is blank in normal operation, and skipping every rule left the
public `/api/collect` endpoint completely unthrottled while still writing to
Postgres.
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from .. import cache
from ..config import get_settings
from ..json_response import jsjson

CallNext = Callable[[Request], Awaitable[Response]]


def get_client_ip(request: Request) -> str:
    """Real client IP behind a proxy — port of the `getIp` helper in `index.ts`."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@dataclass(frozen=True)
class RateLimitRule:
    """One limiter, equivalent to a single `rateLimit({...})` call."""

    name: str
    prefix: str
    window_ms: int
    max_requests: int
    message: str
    path_prefix: str
    exact_paths: tuple[str, ...] | None = None
    skip_path_prefix: str | None = None

    @property
    def window_seconds(self) -> int:
        return max(self.window_ms // 1000, 1)

    def matches(self, path: str) -> bool:
        if self.exact_paths is not None:
            return path in self.exact_paths
        if not path.startswith(self.path_prefix):
            return False
        if self.skip_path_prefix and path.startswith(self.skip_path_prefix):
            return False
        return True


def default_rules() -> list[RateLimitRule]:
    """The limiter stack from `index.ts`, in the same order."""
    settings = get_settings()
    return [
        # 1. Global — 300 req / 15 min per IP, skipping /api/collect
        RateLimitRule(
            name="global",
            prefix="rl:global:",
            window_ms=settings.RATE_LIMIT_WINDOW_MS,
            max_requests=settings.RATE_LIMIT_MAX,
            message="Too many requests, please try again later.",
            path_prefix="/api/",
            skip_path_prefix="/api/collect",
        ),
        # 2. Auth — 10 req / 15 min per IP (brute-force protection)
        RateLimitRule(
            name="auth",
            prefix="rl:auth:",
            window_ms=15 * 60 * 1000,
            max_requests=10,
            message="Too many auth attempts, please try again in 15 minutes.",
            path_prefix="/api/auth/",
            exact_paths=(
                "/api/auth/login",
                "/api/auth/register",
                "/api/auth/forgot-password",
            ),
        ),
        # 3. Collection — 60 events / min per IP
        RateLimitRule(
            name="collect",
            prefix="rl:collect:",
            window_ms=60 * 1000,
            max_requests=60,
            message="Event rate limit exceeded, slow down.",
            path_prefix="/api/collect",
        ),
        # 4. Admin — 30 req / 15 min per IP
        RateLimitRule(
            name="admin",
            prefix="rl:admin:",
            window_ms=15 * 60 * 1000,
            max_requests=30,
            message="Too many admin requests, please slow down.",
            path_prefix="/api/admin",
        ),
    ]


class LocalWindowCounter:
    """Per-process fixed-window counter, used only when Redis returns nothing.

    Approximate by construction: the counters live in one instance's memory, so
    across N instances the effective limit is roughly `max_requests * N`, and they
    reset on deploy. That is still the difference between "throttled" and "wide
    open", which is where the endpoint stood with no Redis.
    """

    def __init__(
        self,
        max_keys: int = 10_000,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._windows: dict[str, tuple[float, int]] = {}
        self._max_keys = max_keys
        self._clock = clock

    def increment(self, key: str, window_seconds: int) -> tuple[int, int]:
        """Return `(count, remaining_seconds)` for the key's current window."""
        now = self._clock()
        expires_at, count = self._windows.get(key, (0.0, 0))
        if now >= expires_at:
            expires_at, count = now + window_seconds, 0
        count += 1
        self._windows[key] = (expires_at, count)

        if len(self._windows) > self._max_keys:
            self._sweep(now)

        return count, max(int(expires_at - now), 0)

    def _sweep(self, now: float) -> None:
        """Drop expired windows, then the soonest-to-expire if still over budget.

        Without the second step a flood of distinct keys (every request a new IP)
        would grow the dict without bound, since nothing has expired yet.
        """
        for key in [k for k, (expires_at, _) in self._windows.items() if now >= expires_at]:
            del self._windows[key]

        overflow = len(self._windows) - self._max_keys
        if overflow > 0:
            soonest = sorted(self._windows.items(), key=lambda item: item[1][0])
            for key, _ in soonest[:overflow]:
                del self._windows[key]

    def size(self) -> int:
        return len(self._windows)

    def clear(self) -> None:
        self._windows.clear()


# One counter per process, shared by every middleware instance — it is a
# process-wide fallback, not per-middleware state. `reset_local_windows()` exists
# so tests start from a clean slate instead of inheriting another test's counts.
LOCAL_WINDOWS = LocalWindowCounter()


def reset_local_windows() -> None:
    LOCAL_WINDOWS.clear()


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, rules: list[RateLimitRule] | None = None) -> None:
        super().__init__(app)
        self.rules = rules if rules is not None else default_rules()

    async def dispatch(self, request: Request, call_next: CallNext) -> Response:
        path = request.url.path
        ip = get_client_ip(request)

        # Track the last matching rule so the informational headers reflect the
        # same limiter Express would have reported (later middleware wins).
        last_state: tuple[RateLimitRule, int, int] | None = None

        for rule in self.rules:
            if not rule.matches(path):
                continue

            result = await cache.increment_with_ttl(
                f"{rule.prefix}{ip}", rule.window_seconds
            )
            if result is None:
                # Redis unavailable — count in-process instead of skipping the rule.
                result = LOCAL_WINDOWS.increment(f"{rule.prefix}{ip}", rule.window_seconds)

            count, remaining_ttl = result
            last_state = (rule, count, remaining_ttl)

            if count > rule.max_requests:
                return jsjson(
                    {"error": rule.message},
                    429,
                    headers={
                        "RateLimit-Limit": str(rule.max_requests),
                        "RateLimit-Remaining": "0",
                        "RateLimit-Reset": str(remaining_ttl),
                        "RateLimit-Policy": f"{rule.max_requests};w={rule.window_seconds}",
                    },
                )

        response = await call_next(request)

        if last_state is not None:
            rule, count, remaining_ttl = last_state
            response.headers["RateLimit-Limit"] = str(rule.max_requests)
            response.headers["RateLimit-Remaining"] = str(max(rule.max_requests - count, 0))
            response.headers["RateLimit-Reset"] = str(remaining_ttl)
            response.headers["RateLimit-Policy"] = (
                f"{rule.max_requests};w={rule.window_seconds}"
            )

        return response
