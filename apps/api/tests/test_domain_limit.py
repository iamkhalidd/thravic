"""Domain creation respects the plan's domain limit — it used to be unchecked."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.middleware.auth import AuthUser, require_auth
from app.plans import PLAN_FEATURES
from app.services import domain_service, plan_service
from app.services.plan_service import Plan

USER_ID = "44444444-4444-4444-8444-444444444444"


@pytest.fixture
def account(monkeypatch):
    state = {"domains": 0, "created": []}

    async def _for_user(_user_id):
        return Plan(USER_ID, "free", PLAN_FEATURES["free"], 5_000, 1)

    async def _count_by_user(_user_id):
        return state["domains"]

    async def _create(user_id, domain, name, tracking_id):
        state["created"].append(domain)
        return {"id": "d1", "domain": domain, "name": name, "tracking_id": tracking_id,
                "verified": False}

    monkeypatch.setattr(plan_service, "for_user", _for_user)
    monkeypatch.setattr(domain_service, "count_by_user", _count_by_user)
    monkeypatch.setattr(domain_service, "create", _create)
    app.dependency_overrides[require_auth] = lambda: AuthUser(user_id=USER_ID, email="a@b.c")
    yield state
    app.dependency_overrides.clear()


def test_first_domain_is_created(account):
    with TestClient(app) as client:
        response = client.post("/api/domains", json={"domain": "first.example.com"})

    assert response.status_code == 201
    assert account["created"] == ["first.example.com"]


def test_a_domain_beyond_the_limit_is_refused(account):
    account["domains"] = 1

    with TestClient(app) as client:
        response = client.post("/api/domains", json={"domain": "second.example.com"})

    assert response.status_code == 403
    assert response.json() == {
        "error": "Your free plan allows 1 domain. Upgrade to add more.",
        "upgrade": True,
    }
    assert account["created"] == []
