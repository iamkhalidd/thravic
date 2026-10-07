"""Monthly event limits — counted from real events and checked at collection.

Plans advertised 5k / 100k / 500k events a month but nothing enforced them.
Skipped unless `THRAVIC_TEST_DATABASE_URL` is set.
"""

from __future__ import annotations

import uuid

import pytest

from app.services import event_service, plan_service, session_service
from tests.conftest import requires_test_db
from tests.test_event_ingestion import _tracker_payload

pytestmark = requires_test_db


@pytest.fixture(autouse=True)
def _fresh_quota_cache():
    plan_service.clear_local_quota_cache()
    yield
    plan_service.clear_local_quota_cache()


async def _owner_with_limit(domain_id: str, db_pool, limit: int) -> str:
    async with db_pool.acquire() as conn:
        user_id = await conn.fetchval("SELECT user_id FROM domains WHERE id = $1", domain_id)
        await conn.execute(
            "INSERT INTO subscriptions (user_id, plan, status, events_limit, domains_limit) "
            "VALUES ($1, 'pro', 'active', $2, 3)",
            user_id,
            limit,
        )
    return str(user_id)


async def _store_events(domain_id: str, count: int) -> None:
    payload = _tracker_payload(domain_id)
    await session_service.upsert(payload)
    await event_service.batch_insert(
        [{**payload, "eventId": str(uuid.uuid4())} for _ in range(count)]
    )


async def test_under_the_limit_is_accepted(seeded_domain, db_pool):
    owner = await _owner_with_limit(seeded_domain, db_pool, 3)
    await _store_events(seeded_domain, 2)

    assert await plan_service.over_event_limit(owner) is False


async def test_reaching_the_limit_stops_collection(seeded_domain, db_pool):
    owner = await _owner_with_limit(seeded_domain, db_pool, 3)
    await _store_events(seeded_domain, 3)

    assert await plan_service.over_event_limit(owner) is True


async def test_the_answer_is_cached_between_batches(seeded_domain, db_pool):
    owner = await _owner_with_limit(seeded_domain, db_pool, 3)
    assert await plan_service.over_event_limit(owner) is False

    await _store_events(seeded_domain, 3)

    # Reused for QUOTA_CACHE_SECONDS rather than counted on every batch.
    assert await plan_service.over_event_limit(owner) is False
    plan_service.clear_local_quota_cache()
    assert await plan_service.over_event_limit(owner) is True


async def test_an_inactive_subscription_falls_back_to_the_free_limit(seeded_domain, db_pool):
    owner = await _owner_with_limit(seeded_domain, db_pool, 1_000_000)
    async with db_pool.acquire() as conn:
        await conn.execute("UPDATE subscriptions SET status = 'canceled' WHERE user_id = $1", owner)

    plan = await plan_service.for_user(owner)

    assert (plan.name, plan.events_limit) == ("free", 5_000)


async def test_a_failing_check_accepts_events(monkeypatch):
    async def _broken(_user_id):
        raise ConnectionError("database unavailable")

    monkeypatch.setattr(plan_service, "for_user", _broken)

    assert await plan_service.over_event_limit(str(uuid.uuid4())) is False
