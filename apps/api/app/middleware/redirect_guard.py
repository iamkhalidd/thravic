"""Redirect guard — port of `middleware/redirectGuard.ts`.

Prevents open-redirect vulnerabilities by validating every redirect target against
an allowlist built from `CORS_ORIGIN` plus the OAuth provider hosts.

Express enforces this by monkey-patching `res.redirect`. FastAPI has no equivalent,
so the rule is: **never return a `RedirectResponse` directly — always go through
`redirect_to()`**, which validates first and returns the same 400 body Express
produces for a blocked target.
"""

from __future__ import annotations

from urllib.parse import urlparse

from starlette.responses import Response

from ..config import get_settings
from ..errors import PayloadError
from ..logging import create_logger

log = create_logger("RedirectGuard")

# OAuth provider endpoints are explicitly allowed
ALWAYS_ALLOWED_HOSTS = frozenset({"", "github.com", "accounts.google.com"})

UNSAFE_REDIRECT_BODY = {"error": "Invalid redirect URL", "code": "UNSAFE_REDIRECT"}

DEFAULT_REDIRECT_STATUS = 302

# Express pulls the reason phrase from the `statuses` package
STATUS_REASONS = {
    301: "Moved Permanently",
    302: "Found",
    303: "See Other",
    307: "Temporary Redirect",
    308: "Permanent Redirect",
}


def build_allowed_hosts() -> set[str]:
    """Allowed redirect hosts: relative paths, OAuth providers, and CORS origins."""
    hosts: set[str] = set(ALWAYS_ALLOWED_HOSTS)

    for origin in get_settings().allowed_origins:
        netloc = urlparse(origin).netloc
        if netloc:
            hosts.add(netloc)
        else:
            log.warning(f'redirectGuard: cannot parse CORS_ORIGIN "{origin}"')

    return hosts


_allowed_hosts = build_allowed_hosts()


def is_safe_redirect_url(url: str) -> bool:
    """`True` only for relative paths or hosts in the allowlist."""
    # Block protocol-relative URLs such as //evil.com
    if url.startswith("//"):
        return False

    # Allow safe relative paths
    if url.startswith("/"):
        return True

    try:
        parsed = urlparse(url)
    except ValueError:
        return False

    # Only http(s) — blocks javascript:, data:, and friends
    if parsed.scheme.lower() not in ("http", "https"):
        return False

    return parsed.netloc in _allowed_hosts


def redirect_to(url: str, status_code: int = DEFAULT_REDIRECT_STATUS) -> Response:
    """Validate a redirect target, then return a redirect response.

    Raises `PayloadError` with Express's exact 400 body when the target is unsafe.

    The response body mirrors Express's default (non-HTML) redirect shape:
    `Found. Redirecting to <url>` with a `text/plain` content type. Express also
    serves an HTML variant for clients that send `Accept: text/html`; that branch
    is not replicated because no browser renders a redirect body.
    """
    if not is_safe_redirect_url(url):
        log.warning(f"redirectGuard blocked unsafe redirect to: {url}")
        raise PayloadError(UNSAFE_REDIRECT_BODY, 400)

    reason = STATUS_REASONS.get(status_code, "Found")
    response = Response(
        content=f"{reason}. Redirecting to {url}",
        status_code=status_code,
    )
    response.headers["location"] = url
    response.headers["content-type"] = "text/plain; charset=utf-8"
    return response
