"""CORS — reproduces the custom origin callback in `index.ts`.

Express does not use a static allowlist: `/api/collect` is open to any origin
(customer websites post from their own domains) with a 204 preflight, while every
other route is whitelisted against `CORS_ORIGIN` with a 200 preflight.

Rejections are returned as a JSON 500 here rather than raised, because Starlette's
exception handlers sit *inside* user middleware — an exception raised in this
layer would bypass them and produce a plain-text 500 instead of the JSON body the
Express error handler produces.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from ..config import get_settings
from ..json_response import jsjson

CallNext = Callable[[Request], Awaitable[Response]]

COLLECT_PREFIX = "/api/collect"

WHITELIST_METHODS = "GET,POST,PUT,DELETE,PATCH"
WHITELIST_HEADERS = "Content-Type, Authorization, X-Requested-With"
# Express joins the array with ',' and no spaces; matching that byte-for-byte
EXPOSED_HEADERS = "RateLimit-Limit,RateLimit-Remaining,RateLimit-Reset"

PREFLIGHT_MAX_AGE = "600"


def _collect_headers() -> dict[str, str]:
    """Preflight response for `/api/collect`.

    Answered by the app-level `cors` middleware in `index.ts`, which joins the
    `methods` array with a comma and **no space**.
    """
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": PREFLIGHT_MAX_AGE,
    }


def _collect_response_headers() -> dict[str, str]:
    """CORS headers on an actual (non-preflight) collect response.

    These come from `collect.ts`'s own `openCors` middleware, which runs later
    than the app-level CORS and hardcodes its strings - so the methods list here
    DOES contain a space, unlike the preflight above. The asymmetry looks like a
    typo but is the real deployed behaviour, and `Max-Age` is preflight-only.
    """
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }


def _whitelist_headers(origin: str) -> dict[str, str]:
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": WHITELIST_METHODS,
        "Access-Control-Allow-Headers": WHITELIST_HEADERS,
        "Access-Control-Expose-Headers": EXPOSED_HEADERS,
        "Access-Control-Max-Age": PREFLIGHT_MAX_AGE,
    }


class ThravicCORSMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, allowed_origins: list[str]) -> None:
        super().__init__(app)
        self.allowed_origins = allowed_origins
        self.is_production = get_settings().is_production

    async def dispatch(self, request: Request, call_next: CallNext) -> Response:
        origin = request.headers.get("origin")
        path = request.url.path

        # ── Collection endpoint: open to any origin ───────────────────────
        if path.startswith(COLLECT_PREFIX):
            if request.method == "OPTIONS":
                return Response(status_code=204, headers=_collect_headers())
            response = await call_next(request)
            for key, value in _collect_response_headers().items():
                response.headers[key] = value
            return response

        # ── All other routes: strict whitelist ───────────────────────────
        # No Origin header means a server-to-server call, which is allowed.
        if origin is None:
            return await call_next(request)

        if origin not in self.allowed_origins:
            # `callback(new Error(...))` → centralized handler → 500
            message = f'CORS: origin "{origin}" is not allowed'
            body = message if not self.is_production else "Internal server error"
            return jsjson({"error": body, "code": "INTERNAL_ERROR"}, 500)

        if request.method == "OPTIONS":
            return Response(status_code=200, headers=_whitelist_headers(origin))

        response = await call_next(request)
        for key, value in _whitelist_headers(origin).items():
            response.headers[key] = value
        return response
