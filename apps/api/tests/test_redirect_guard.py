"""Redirect-guard tests — the open-redirect allowlist.

Express enforces this by monkey-patching `res.redirect`; the port enforces it by
routing every redirect through `redirect_to()`. These tests pin the allowlist
rules, because a regression here is a security hole rather than a cosmetic bug.
"""

from __future__ import annotations

import pytest

from app.errors import PayloadError
from app.middleware.redirect_guard import (
    build_allowed_hosts,
    is_safe_redirect_url,
    redirect_to,
)


@pytest.mark.parametrize(
    "url",
    [
        "/dashboard",
        "/auth/callback?accessToken=x",
        "/login?error=missing_code",
    ],
)
def test_relative_paths_are_allowed(url):
    assert is_safe_redirect_url(url) is True


@pytest.mark.parametrize(
    "url",
    [
        "//evil.com",
        "https://evil.com/steal",
        "http://evil.com",
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "not-a-url",
        "",
    ],
)
def test_unsafe_targets_are_blocked(url):
    assert is_safe_redirect_url(url) is False


@pytest.mark.parametrize(
    "url",
    [
        "https://github.com/login/oauth/authorize?client_id=x",
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=x",
    ],
)
def test_oauth_provider_hosts_are_allowed(url):
    assert is_safe_redirect_url(url) is True


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:3000/login?error=oauth_error",
        "http://localhost:3002/",
    ],
)
def test_cors_origins_are_allowed(url):
    """The allowlist is derived from CORS_ORIGIN, so FRONTEND_URL must be listed."""
    assert is_safe_redirect_url(url) is True


def test_allowed_hosts_include_cors_origins_and_providers():
    hosts = build_allowed_hosts()

    assert "localhost:3000" in hosts
    assert "localhost:3002" in hosts
    assert "github.com" in hosts
    assert "accounts.google.com" in hosts
    assert "" in hosts  # relative paths


def test_redirect_to_returns_302_for_safe_target():
    response = redirect_to("/dashboard")

    assert response.status_code == 302
    assert response.headers["location"] == "/dashboard"


def test_redirect_to_rejects_unsafe_target_with_express_body():
    with pytest.raises(PayloadError) as excinfo:
        redirect_to("//evil.com")

    assert excinfo.value.status_code == 400
    assert excinfo.value.payload == {
        "error": "Invalid redirect URL",
        "code": "UNSAFE_REDIRECT",
    }
