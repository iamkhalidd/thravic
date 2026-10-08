"""`GET /api/payments/usage`: every allowance, its reset time, and when events
will run out at the current pace."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.config import get_settings
from app.main import app
from app.middleware.auth import AuthUser, require_auth
from app.routers import payments
from app.services import plan_catalog
from tests.conftest import requires_test_db

NOW = datetime(2026, 10, 10, 12, tzinfo=UTC)
DAY = timedelta(days=1)


@pytest.mark.parametrize(
    ("used", "limit", "elapsed", "expected"),
    [
        # 400 in 4 days = 100/day; 600 left -> 6 more days, before the reset in 26.
        (400, 1000, 4 * DAY, NOW + 6 * DAY),
        # 100 in 10 days: 90 days to go, after the reset -> no warning.
        (100, 1000, 10 * DAY, None),
        (0, 1000, 4 * DAY, None),  # nothing used yet
        (1000, 1000, 4 * DAY, None),  # already out
        (10, 1000, timedelta(minutes=20), None),  # too little to go on
    ],
)
def test_projected_limit_at(used, limit, elapsed, expected):
    start = NOW - elapsed
    resets = start + 30 * DAY

    assert payments.projected_limit_at(used, limit, start, resets, NOW) == expected


@pytest.fixture
def configured(monkeypatch):
    # The endpoint answers a stub without DATABASE_URL; tests use the pool directly.
    monkeypatch.setattr(get_settings(), "DATABASE_URL", "postgresql://configured")


@requires_test_db
async def test_every_meter_is_reported(seeded_domain, db_pool, make_plan, configured):
    plan = await make_plan(
        events_limit=1000,
        domains_limit=3,
        team_limit=2,
        recordings_per_day=50,
        features=["analytics", "team", "recordings"],
    )
    async with db_pool.acquire() as conn:
        owner = str(await conn.fetchval("SELECT user_id FROM domains WHERE id = $1", seeded_domain))
        # Paid 35 days ago: this cycle started 5 days ago and renews in 25.
        await conn.execute(
            "INSERT INTO subscriptions (user_id, plan, status, events_limit, domains_limit, "
            "current_period_start, current_period_end) VALUES ($1, $2, 'active', 0, 0, "
            "NOW() - INTERVAL '35 days', NOW() + INTERVAL '25 days')",
            owner,
            plan,
        )
        await conn.executemany(
            "INSERT INTO events (domain_id, type, url, created_at) "
            "VALUES ($1, 'pageview', 'https://x/', $2)",
            [(seeded_domain, datetime.now(UTC) - DAY)] * 4
            + [(seeded_domain, datetime.now(UTC) - 6 * DAY)] * 3,  # last cycle
        )
    plan_catalog.invalidate()
    app.dependency_overrides[require_auth] = lambda: AuthUser(user_id=owner, email="o@x.invalid")
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://t"
        ) as client:
            usage = (await client.get("/api/payments/usage")).json()["usage"]
    finally:
        app.dependency_overrides.clear()
        plan_catalog.invalidate()

    meters = {m["key"]: m for m in usage["meters"]}
    assert set(meters) == {"events", "websites", "team", "recordings"}
    assert (meters["events"]["used"], meters["events"]["limit"]) == (4, 1000)
    assert usage["eventsThisMonth"] == 4  # the flat fields older clients read
    renews_in = datetime.fromisoformat(meters["events"]["resetsAt"]) - datetime.now(UTC)
    assert 24 * DAY < renews_in < 26 * DAY
    assert (meters["websites"]["used"], meters["websites"]["limit"]) == (1, 3)
    assert (meters["team"]["used"], meters["team"]["limit"]) == (0, 2)
    assert meters["recordings"]["limit"] == 50
    assert meters["recordings"]["resetsAt"] is not None


@requires_test_db
async def test_meters_follow_the_plans_features(seeded_domain, db_pool, configured):
    async with db_pool.acquire() as conn:
        owner = str(await conn.fetchval("SELECT user_id FROM domains WHERE id = $1", seeded_domain))
    app.dependency_overrides[require_auth] = lambda: AuthUser(user_id=owner, email="o@x.invalid")
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://t"
        ) as client:
            usage = (await client.get("/api/payments/usage")).json()["usage"]
    finally:
        app.dependency_overrides.clear()

    free = await plan_catalog.get("free")
    keys = {m["key"] for m in usage["meters"]}
    assert keys == {"events", "websites"} | ({"team"} & set(free.features)) | (
        {"recordings"} & set(free.features)
    )
