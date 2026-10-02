"""OAuth route tests.

Only the paths that do not require live provider credentials are covered: the
"not configured" guards and the pre-flight redirects. The token-exchange paths
need GitHub/Google credentials and are mocked at the HTTP boundary in the parity
harness instead.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_all_fourteen_auth_handlers_are_registered():
    """`routes/auth.ts` exposes exactly 14 handlers; the port must match.

    Counted as (path, method) pairs rather than unique paths, because `/me` and
    `/avatar` each carry two methods.
    """
    from app.routers import auth as auth_router

    operations = set()
    for route in auth_router.router.routes:
        for method in getattr(route, "methods", None) or set():
            if method not in ("HEAD", "OPTIONS"):
                operations.add((route.path, method))

    assert len(operations) == 14

    for expected in (
        ("/register", "POST"),
        ("/login", "POST"),
        ("/refresh", "POST"),
        ("/logout", "POST"),
        ("/forgot-password", "POST"),
        ("/reset-password", "POST"),
        ("/me", "GET"),
        ("/me", "PATCH"),
        ("/avatar", "POST"),
        ("/avatar", "DELETE"),
        ("/github", "GET"),
        ("/github/callback", "GET"),
        ("/google", "GET"),
        ("/google/callback", "GET"),
    ):
        assert expected in operations, f"missing {expected[1]} {expected[0]}"


def test_github_authorize_returns_503_when_unconfigured(client):
    response = client.get("/api/auth/github", follow_redirects=False)

    assert response.status_code == 503
    assert response.json() == {"error": "GitHub OAuth not configured"}


def test_google_authorize_returns_503_when_unconfigured(client):
    response = client.get("/api/auth/google", follow_redirects=False)

    assert response.status_code == 503
    assert response.json() == {"error": "Google OAuth not configured"}


def test_github_callback_without_code_redirects_to_frontend(client):
    response = client.get("/api/auth/github/callback", follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"] == "http://localhost:3000/login?error=missing_code"


def test_google_callback_without_code_redirects_to_frontend(client):
    response = client.get("/api/auth/google/callback", follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"] == "http://localhost:3000/login?error=missing_code"


def test_empty_code_is_treated_as_missing(client):
    """Express checks `!code`, so an empty query value takes the same branch."""
    response = client.get(
        "/api/auth/github/callback?code=", follow_redirects=False
    )

    assert response.status_code == 302
    assert response.headers["location"] == "http://localhost:3000/login?error=missing_code"


def test_oauth_redirects_survive_the_redirect_guard(client):
    """The guard allows http(s) 302s to CORS_ORIGIN hosts, so these must not 400."""
    for path in ("/api/auth/github/callback", "/api/auth/google/callback"):
        response = client.get(path, follow_redirects=False)

        assert response.status_code == 302
        assert response.headers["location"].startswith("http://localhost:3000/login?error=")
