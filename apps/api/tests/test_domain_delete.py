"""Deleting a site: owner only, and the caches that outlive the row are dropped."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.middleware.auth import AuthUser, require_auth
from app.routers import domains as domains_router
from app.services import domain_service, plan_service

OWNER_ID = "55555555-5555-4555-8555-555555555555"
OTHER_ID = "66666666-6666-4666-8666-666666666666"


@pytest.fixture
def site(monkeypatch):
    state = {"removed": [], "forgotten": []}

    async def _get_by_id(domain_id):
        return {"id": domain_id, "user_id": OWNER_ID, "tracking_id": "tf_abc"}

    async def _remove(domain_id):
        state["removed"].append(domain_id)

    async def _query(_sql, *_args):
        return [{"id": "d2"}, {"id": "d3"}]

    async def _forget(domain_ids):
        state["forgotten"].extend(domain_ids)

    monkeypatch.setattr(domain_service, "get_by_id", _get_by_id)
    monkeypatch.setattr(domain_service, "remove", _remove)
    monkeypatch.setattr(domains_router, "query", _query)
    monkeypatch.setattr(plan_service, "forget_paused_sites", _forget)
    yield state
    app.dependency_overrides.clear()


def _sign_in(user_id):
    app.dependency_overrides[require_auth] = lambda: AuthUser(user_id=user_id, email="a@b.c")


def test_the_owner_deletes_and_paused_sites_are_rechecked(site):
    _sign_in(OWNER_ID)
    with TestClient(app) as client:
        response = client.delete("/api/domains/d1")

    assert response.status_code == 200
    assert site["removed"] == ["d1"]
    # The freed slot may resume a paused site, so its cached answer goes.
    assert site["forgotten"] == ["d2", "d3"]


def test_someone_else_cannot_delete(site):
    _sign_in(OTHER_ID)
    with TestClient(app) as client:
        response = client.delete("/api/domains/d1")

    assert response.status_code == 404
    assert site["removed"] == []


async def test_remove_forgets_the_tracking_lookup(monkeypatch):
    forgotten = []

    async def _query_one(_sql, *_args):
        return {"tracking_id": "tf_abc"}

    async def _forget(tracking_id):
        forgotten.append(tracking_id)

    monkeypatch.setattr(domain_service, "query_one", _query_one)
    monkeypatch.setattr(domain_service, "_forget_tracking_lookup", _forget)

    await domain_service.remove("d1")

    assert forgotten == ["tf_abc"]
