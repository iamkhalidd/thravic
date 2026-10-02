"""Rate limiting — mirrors the four Express `express-rate-limit` tiers.

Express registers several limiters, and a request can be counted by more than one
(for example `/api/auth/login` is matched by both the global and the auth
limiter). This middleware evaluates every matching rule in registration order and
rejects on the first breach, so thresholds behave identically.

Redis is used for counters, with the same key prefixes as the Express limiters, so
existing buckets carry over across the cutover. When Redis is unavailable the
rule is skipped, matching `rate-limit-redis`'s graceful degradation.
"""

from __future__ import annotations

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
                continue  # Redis unavailable — limiter is inert, as in Express

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
