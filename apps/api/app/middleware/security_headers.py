"""Security headers — recreates the `helmet` configuration from `index.ts`.

The CSP `connect-src` directive is derived from the same CORS allowlist, exactly
as the Express setup does. If this drifts from `CORS_ORIGIN`, the frontends start
failing on blocked XHR with no server-side error, so it is asserted by a test.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from ..config import get_settings

# Origins permitted to make requests to the API, per the CSP.
CSP_CONNECT_EXTRA = ("'self'",)
FONT_SRC = ("'self'", "https://fonts.gstatic.com")

CallNext = Callable[[Request], Awaitable[Response]]


def build_content_security_policy(allowed_origins: list[str]) -> str:
    settings = get_settings()

    directives: list[tuple[str, list[str]]] = [
        ("default-src", ["'self'"]),
        ("script-src", ["'self'"]),
        ("style-src", ["'self'", "'unsafe-inline'"]),
        ("img-src", ["'self'", "data:", "https:"]),
        # Same list CORS uses — both come from CORS_ORIGIN
        ("connect-src", [*CSP_CONNECT_EXTRA, *allowed_origins]),
        ("font-src", list(FONT_SRC)),
        ("object-src", ["'none'"]),
    ]
    if settings.is_production:
        directives.append(("upgrade-insecure-requests", []))

    return "; ".join(
        f"{name} {' '.join(values)}".strip() for name, values in directives
    )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Applies the helmet-equivalent headers to every response."""

    def __init__(self, app, allowed_origins: list[str]) -> None:
        super().__init__(app)
        self.csp = build_content_security_policy(allowed_origins)
        self.is_production = get_settings().is_production

    async def dispatch(self, request: Request, call_next: CallNext) -> Response:
        response = await call_next(request)

        response.headers["Content-Security-Policy"] = self.csp
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-DNS-Prefetch-Control"] = "off"
        response.headers["X-Download-Options"] = "noopen"
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Origin-Agent-Cluster"] = "?1"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"

        # crossOriginEmbedderPolicy is disabled in Express (needed for the
        # tracking script), so it is deliberately not set here either.

        if self.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        # Prevents CDN cache poisoning on origin-dependent responses
        response.headers["Vary"] = "Origin"

        return response
