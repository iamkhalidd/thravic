"""Cross-tenant isolation for the custom-event analytics routes.

`app/routers/custom_events.py` was the one place in the API that trusted the
`domainId` path parameter on its own: every handler was authenticated, but the
query filtered on `domainId` alone, so any logged-in user could read another
tenant's error / performance / form / rage-click data by supplying that domain's
id. The Express original shipped that way and the port preserved it for parity.

These tests pin the boundary. The assertion that matters is not the status code
but that **the data query never runs**, and that the refusal arrives as a 404
rather than a 500 — each handler catches bare `Exception` and answers with a
route-specific 500, so an ownership error has to re-raise or it silently becomes
a server error.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.middleware.auth import AuthUser, require_auth
from app.routers import custom_events

OWNER = "11111111-1111-4111-8111-111111111111"
INTRUDER = "22222222-2222-4222-8222-222222222222"
DOMAIN_ID = "33333333-3333-4333-8333-333333333333"

ENDPOINTS = ("errors", "performance", "forms", "rage-clicks")


class _DataReads:
    """Stands in for the database so a leak is observable, not inferred."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def query(self, sql, *_args, **_kwargs):
        self.calls.append(sql)
        return []

    async def query_one(self, sql, *_args, **_kwargs):
        self.calls.append(sql)
        return None


@pytest.fixture
def data_reads(monkeypatch):
    recorded = _DataReads()
    monkeypatch.setattr(custom_events, "query", recorded.query)
    monkeypatch.setattr(custom_events, "query_one", recorded.query_one)
    return recorded


@pytest.fixture
def domain(monkeypatch):
    """Point `domain_service.get_by_id` at a domain owned by a chosen user."""

    def _owned_by(user_id: str | None):
        async def _get_by_id(domain_id: str):
            if user_id is None:
                return None
            return {"id": domain_id, "user_id": user_id}

        monkeypatch.setattr(custom_events.domain_service, "get_by_id", _get_by_id)

    return _owned_by


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _authenticate_as(user_id: str) -> None:
    app.dependency_overrides[require_auth] = lambda: AuthUser(
        user_id=user_id, email="someone@example.invalid"
    )


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_a_foreign_domain_is_a_404_and_the_query_never_runs(
    client, domain, data_reads, endpoint
):
    domain(OWNER)
    _authenticate_as(INTRUDER)

    response = client.get(f"/api/custom-events/{DOMAIN_ID}/{endpoint}")

    assert response.status_code == 404, (
        "ownership refusals must not be reported as 500 — each handler catches "
        "bare Exception, so the 404 has to re-raise first"
    )
    assert response.json() == {"error": "Domain not found"}
    assert data_reads.calls == [], (
        "event data was queried for a domain the caller does not own"
    )


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_a_missing_domain_looks_identical_to_a_foreign_one(
    client, domain, data_reads, endpoint
):
    """Otherwise the status code becomes an oracle for valid domain ids."""
    domain(None)
    _authenticate_as(INTRUDER)

    response = client.get(f"/api/custom-events/{DOMAIN_ID}/{endpoint}")

    assert response.status_code == 404
    assert response.json() == {"error": "Domain not found"}
    assert data_reads.calls == []


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_the_owner_still_gets_their_data(client, domain, data_reads, endpoint):
    """The new check must not break the feature for legitimate callers."""
    domain(OWNER)
    _authenticate_as(OWNER)

    response = client.get(f"/api/custom-events/{DOMAIN_ID}/{endpoint}")

    assert response.status_code == 200
    assert data_reads.calls, "the owner's request should have queried event data"


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_an_anonymous_caller_is_still_rejected(client, data_reads, endpoint):
    """Authentication still runs, and ahead of the ownership check."""
    response = client.get(f"/api/custom-events/{DOMAIN_ID}/{endpoint}")

    assert response.status_code == 401
    assert data_reads.calls == []
