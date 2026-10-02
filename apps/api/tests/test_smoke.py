"""Smoke tests for the middleware stack and error contracts.

These do **not** require Postgres or Redis: the app is designed to boot without
either (database warnings, caching disabled), which is exactly the state these
tests exercise. Assertions target the *shape* of responses, because those shapes
are the contract both Next.js frontends were built against.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


# ── Health ───────────────────────────────────────────────────────────────────


def test_health_returns_expected_shape(client):
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert set(body) == {"status", "timestamp", "uptime", "environment"}
    assert body["timestamp"].endswith("Z")
    assert isinstance(body["uptime"], (int, float))


def test_content_type_matches_express(client):
    response = client.get("/health")
    assert response.headers["content-type"] == "application/json; charset=utf-8"


# ── Error contracts ──────────────────────────────────────────────────────────


def test_unknown_route_matches_express_catch_all(client):
    response = client.get("/definitely-not-a-route")

    assert response.status_code == 404
    assert response.json() == {"error": "Not found", "code": "NOT_FOUND"}


def test_missing_token_has_no_code_field(client):
    """Express replies directly here, so the body has no `code` key."""
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.json() == {"error": "No token provided"}


def test_malformed_bearer_is_rejected(client):
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-jwt"})

    assert response.status_code == 401
    assert response.json() == {"error": "Invalid or expired token"}


def test_invalid_email_returns_zod_message(client):
    response = client.post(
        "/api/auth/login", json={"email": "not-an-email", "password": "whatever"}
    )

    assert response.status_code == 400
    # Exactly the Zod message, unwrapped from Pydantic's "Value error, " prefix
    assert response.json() == {"error": "Invalid email address"}


def test_short_password_returns_zod_message(client):
    response = client.post(
        "/api/auth/login", json={"email": "a@b.com", "password": ""}
    )

    assert response.status_code == 400
    assert response.json() == {"error": "Password is required"}


def test_registration_gate_closed_when_settings_unavailable(client, monkeypatch):
    """Documents a surprising but faithful behaviour.

    With no database, `is_enabled('registration.enabled')` returns False, and the
    Express `enabled !== false` check therefore *closes* registration. The same
    happens in Express when the setting row is missing; `schema.sql` seeds it to
    true, which is what keeps the normal path open.

    ⚠️ The gate is forced closed explicitly rather than relying on the database
    being absent. With a real `DATABASE_URL` configured — which is the case in a
    developer's `.env` — the setting IS seeded true, so this request sailed
    through and created a user row in whatever database the environment pointed
    at. Relying on absence of a service to prove a gate is closed makes the test
    both environment-dependent and destructive.
    """
    from app.middleware import settings_gate
    from app.services import settings_service

    async def _always_disabled(_key: str) -> bool:
        return False

    # Patch both the module and the name the gate resolved at import time, so the
    # override holds regardless of how it was imported.
    monkeypatch.setattr(settings_service, "is_enabled", _always_disabled)
    if hasattr(settings_gate, "is_enabled"):
        monkeypatch.setattr(settings_gate, "is_enabled", _always_disabled)

    response = client.post(
        "/api/auth/register",
        json={
            "email": "registration-gate-probe@example.invalid",
            "password": "Password1!",
            "name": "Gate Probe",
        },
    )

    assert response.status_code == 403
    assert response.json() == {
        "error": "Registration is currently closed. Please check back later.",
        "code": "REGISTRATION_DISABLED",
    }


# ── CORS ─────────────────────────────────────────────────────────────────────


def test_whitelisted_origin_is_echoed_with_credentials(client):
    response = client.get("/health", headers={"Origin": "http://localhost:3000"})

    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_unknown_origin_is_rejected_as_json_500(client):
    response = client.get("/health", headers={"Origin": "https://evil.example"})

    assert response.status_code == 500
    assert response.json() == {
        "error": 'CORS: origin "https://evil.example" is not allowed',
        "code": "INTERNAL_ERROR",
    }


def test_collect_endpoint_is_open_to_any_origin(client):
    response = client.options(
        "/api/collect/some-tracking-id", headers={"Origin": "https://customer-site.example"}
    )

    assert response.status_code == 204
    assert response.headers["access-control-allow-origin"] == "*"


def test_vary_origin_is_always_set(client):
    # Prevents CDN cache poisoning on origin-dependent responses
    response = client.get("/health")
    assert "origin" in response.headers["vary"].lower()


# ── Security headers ─────────────────────────────────────────────────────────


def test_helmet_equivalent_headers_are_present(client):
    response = client.get("/health")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "SAMEORIGIN"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["x-xss-protection"] == "0"
    assert response.headers["cross-origin-opener-policy"] == "same-origin"


def test_csp_connect_src_derives_from_cors_origin(client):
    """If CSP and CORS drift apart, the frontends break with no server-side error."""
    response = client.get("/health")
    csp = response.headers["content-security-policy"]

    assert "connect-src 'self' http://localhost:3000 http://localhost:3002" in csp
    assert "object-src 'none'" in csp
    # crossOriginEmbedderPolicy is disabled in Express for the tracking script
    assert "Cross-Origin-Embedder-Policy" not in response.headers
