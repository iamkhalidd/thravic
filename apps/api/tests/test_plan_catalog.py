"""The plans table is the one definition of each plan.

Admin edits to a plan reach existing customers (limits, features), the public
pricing (bullets), checkout (only active plans), and plans an admin creates can
be bought. Team size and recordings per day are enforced from the plan.
"""

from __future__ import annotations

import httpx
import pytest

from app.config import get_settings
from app.main import app
from app.middleware.admin_auth import AdminUser, admin_auth
from app.middleware.auth import require_auth
from app.routers import payments
from app.services import plan_catalog, plan_service, recording_service
from app.services.plan_catalog import PlanDef
from tests.conftest import requires_test_db


async def _owner(db_pool, domain_id):
    async with db_pool.acquire() as conn:
        return str(await conn.fetchval("SELECT user_id FROM domains WHERE id = $1", domain_id))


async def _subscribe(db_pool, user_id, plan):
    async with db_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO subscriptions (user_id, plan, status, events_limit, domains_limit) "
            "VALUES ($1, $2, 'active', 1, 1)",
            user_id,
            plan,
        )


def _client(user_id: str, admin: bool = False) -> httpx.AsyncClient:
    user = AdminUser(user_id=user_id, email="a@example.invalid", role="admin")
    app.dependency_overrides[require_auth] = lambda: user
    if admin:
        app.dependency_overrides[admin_auth] = lambda: user
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


@pytest.fixture(autouse=True)
def _reset():
    plan_catalog.invalidate()
    yield
    app.dependency_overrides.clear()
    plan_catalog.invalidate()


# ── Admin edits reach everyone ─────────────────────────────────────────────


@requires_test_db
async def test_an_admin_edit_applies_to_existing_subscribers(seeded_domain, db_pool, make_plan):
    plan = await make_plan(events_limit=1000, domains_limit=2, features=["analytics"])
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, plan)  # the row itself says 1 event / 1 domain

    before = await plan_service.for_user(owner)

    async with _client(owner, admin=True) as client:
        response = await client.put(
            f"/api/admin/plans/{plan}",
            json={
                "events_limit": 50_000,
                "domains_limit": 5,
                "features": ["analytics", "heatmaps"],
            },
        )
    after = await plan_service.for_user(owner)

    assert response.status_code == 200
    assert (before.events_limit, before.domains_limit) == (1000, 2)
    assert (after.events_limit, after.domains_limit) == (50_000, 5)
    assert "heatmaps" in after.features


@requires_test_db
async def test_unknown_features_are_refused(db_pool, make_plan):
    plan = await make_plan()

    async with _client("00000000-0000-4000-8000-000000000001", admin=True) as client:
        response = await client.put(f"/api/admin/plans/{plan}", json={"features": ["telepathy"]})

    assert response.status_code == 400
    assert "telepathy" in response.json()["error"]


@requires_test_db
async def test_a_created_plan_gets_a_retention_policy(db_pool):
    async with _client("00000000-0000-4000-8000-000000000001", admin=True) as client:
        response = await client.post(
            "/api/admin/plans",
            json={
                "id": "starter_test",
                "name": "Starter",
                "price": 9000,
                "events_limit": 20_000,
                "domains_limit": 2,
                "team_limit": 2,
                "tagline": "For side projects",
                "extra_features": ["Email support"],
            },
        )
    try:
        async with db_pool.acquire() as conn:
            policy = await conn.fetchrow(
                "SELECT * FROM data_retention_policies WHERE plan = 'starter_test'"
            )
        plan = await plan_catalog.find("starter_test")
        assert response.status_code == 201
        assert policy is not None
        assert plan and plan.team_limit == 2 and plan.extra_features == ("Email support",)
    finally:
        async with db_pool.acquire() as conn:
            await conn.execute("DELETE FROM plans WHERE id = 'starter_test'")
            await conn.execute("DELETE FROM data_retention_policies WHERE plan = 'starter_test'")


# ── Buying ─────────────────────────────────────────────────────────────────


@requires_test_db
async def test_a_plan_an_admin_created_can_be_bought(
    seeded_domain, db_pool, make_plan, monkeypatch
):
    plan = await make_plan(events_limit=20_000, domains_limit=2, features=["analytics", "funnels"])
    owner = await _owner(db_pool, seeded_domain)

    async def _no_email(*_args, **_kwargs):
        return None

    monkeypatch.setattr(payments, "_fire_and_forget", lambda coro: coro.close())
    await payments._upgrade_subscription(owner, plan, f"ref_{plan}")

    granted = await plan_service.for_user(owner)
    assert (granted.name, granted.events_limit) == (plan, 20_000)
    assert "funnels" in granted.features


@requires_test_db
async def test_an_inactive_plan_cannot_be_bought(make_plan):
    plan = await make_plan(active=False)

    assert await payments._plan_from_db(plan) is None


# ── Pricing ────────────────────────────────────────────────────────────────


def _plan(**fields) -> PlanDef:
    base = dict(
        id="x",
        name="X",
        price=0,
        events_limit=5000,
        domains_limit=1,
        features=("analytics",),
        retention={"events": 30},
    )
    return PlanDef(**{**base, **fields})


def test_bullets_come_from_the_plan():
    free = _plan(id="free", name="Hobby", features=("analytics", "realtime", "utm"))
    pro = _plan(
        id="pro",
        name="Pro",
        price=45_000,
        events_limit=100_000,
        domains_limit=3,
        features=("analytics", "realtime", "utm", "heatmaps", "team"),
        team_limit=5,
        retention={"events": 365},
        extra_features=("Priority support",),
    )

    assert plan_catalog.bullets(free, [free, pro]) == [
        "1 website",
        "5k events/month",
        "Core analytics",
        "Realtime visitors",
        "UTM & campaign tracking",
        "30-day retention",
    ]
    assert plan_catalog.bullets(pro, [free, pro]) == [
        "3 websites",
        "100k events/month",
        "Everything in Hobby",
        "Heatmaps",
        "Up to 5 team members",
        "1-year retention",
        "Priority support",
    ]


@requires_test_db
async def test_public_plans_include_bullets_and_hide_inactive(make_plan):
    shown = await make_plan(tagline="For testing", badge="New", events_limit=2_000_000)
    hidden = await make_plan(active=False)

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        plans = (await c.get("/api/payments/plans")).json()["plans"]

    ids = {p["id"] for p in plans}
    mine = next(p for p in plans if p["id"] == shown)
    assert hidden not in ids
    assert mine["tagline"] == "For testing" and mine["badge"] == "New"
    assert "2M events/month" in mine["bullets"]


# ── New limits ─────────────────────────────────────────────────────────────


@requires_test_db
async def test_team_size_is_limited_by_the_plan(seeded_domain, db_pool, make_plan, monkeypatch):
    # The feature gate treats "no DATABASE_URL" as free-plan-only.
    monkeypatch.setattr(get_settings(), "DATABASE_URL", "postgresql://configured")
    plan = await make_plan(features=["analytics", "team"], team_limit=1)
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, plan)
    emails = []
    async with db_pool.acquire() as conn:
        for name in ("first", "second"):
            email = f"{name}-{seeded_domain[:8]}@example.invalid"
            await conn.execute("INSERT INTO users (email, name) VALUES ($1, $2)", email, name)
            emails.append(email)

    try:
        async with _client(owner) as client:
            first = await client.post(
                f"/api/teams/{seeded_domain}/invite", json={"email": emails[0]}
            )
            again = await client.post(
                f"/api/teams/{seeded_domain}/invite", json={"email": emails[0], "role": "admin"}
            )
            second = await client.post(
                f"/api/teams/{seeded_domain}/invite", json={"email": emails[1]}
            )
    finally:
        async with db_pool.acquire() as conn:
            await conn.execute("DELETE FROM users WHERE email = ANY($1::text[])", emails)

    assert first.status_code == 200, first.json()
    assert again.status_code == 200  # a role change takes no new seat
    assert second.status_code == 403
    assert second.json()["upgrade"] is True


@requires_test_db
async def test_recordings_per_day_counts_across_the_owners_sites(seeded_domain, db_pool, make_plan):
    plan = await make_plan(features=["analytics", "recordings"], recordings_per_day=2)
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, plan)
    for _ in range(2):
        await recording_service.create(seeded_domain, None, "https://ingest.example.invalid/")

    assert await recording_service.count_started_today_for_owner(owner) == 2
    assert (await plan_service.owner_plan(seeded_domain)).recordings_per_day == 2


def test_the_catalog_falls_back_to_defaults_without_a_database(monkeypatch):
    async def _broken(*_args):
        raise ConnectionError("database down")

    monkeypatch.setattr(plan_catalog, "query", _broken)
    import asyncio

    plans = asyncio.run(plan_catalog.all_plans())
    assert {"free", "pro", "agency"} <= set(plans)
    assert plans["pro"].events_limit == 100_000
