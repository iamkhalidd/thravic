"""Data retention by effective plan, and the daily job's run-once guard.

Skipped unless `THRAVIC_TEST_DATABASE_URL` is set. The database is shared with
other tests, so counts are compared before and after this test's own rows.
"""

from __future__ import annotations

import uuid

import pytest

from app.jobs.retention import apply_retention
from app.jobs.runner import run_if_due
from app.services import retention_service
from tests.conftest import requires_test_db

pytestmark = requires_test_db


async def _owner(db_pool, domain_id: str) -> str:
    async with db_pool.acquire() as conn:
        return str(await conn.fetchval("SELECT user_id FROM domains WHERE id = $1", domain_id))


async def _event_aged(db_pool, domain_id: str, days: int) -> None:
    async with db_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO events (domain_id, type, url, created_at) "
            "VALUES ($1, 'pageview', 'https://x.invalid/', NOW() - make_interval(days => $2))",
            domain_id,
            days,
        )


async def _subscribe(db_pool, user_id: str, plan: str, status: str = "active") -> None:
    async with db_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO subscriptions (user_id, plan, status, events_limit, domains_limit) "
            "VALUES ($1, $2, $3, 100000, 3)",
            user_id, plan, status,
        )
        await conn.execute("UPDATE users SET subscription = $2 WHERE id = $1", user_id, plan)


def _events(report, plan):
    return report["byPlan"].get(plan, {}).get("events", 0)


async def test_free_owner_events_expire_after_30_days(seeded_domain, db_pool):
    before = await retention_service.expired_counts()
    await _event_aged(db_pool, seeded_domain, 40)
    await _event_aged(db_pool, seeded_domain, 5)

    after = await retention_service.expired_counts()

    assert _events(after, "free") - _events(before, "free") == 1


async def test_active_pro_owner_keeps_a_year(seeded_domain, db_pool):
    await _subscribe(db_pool, await _owner(db_pool, seeded_domain), "pro")
    before = await retention_service.expired_counts()
    await _event_aged(db_pool, seeded_domain, 100)
    await _event_aged(db_pool, seeded_domain, 400)

    after = await retention_service.expired_counts()

    assert _events(after, "pro") - _events(before, "pro") == 1


async def test_a_lapsed_paid_owner_is_reported_separately(seeded_domain, db_pool):
    await _subscribe(db_pool, await _owner(db_pool, seeded_domain), "pro", status="canceled")
    before = await retention_service.expired_counts()
    await _event_aged(db_pool, seeded_domain, 100)

    after = await retention_service.expired_counts()

    # Held to the free policy, and flagged so a dry run shows the cliff.
    assert _events(after, "free") - _events(before, "free") == 1
    assert after["fromInactivePaidOwners"] - before["fromInactivePaidOwners"] == 1


async def test_delete_removes_only_expired_rows_in_batches(seeded_domain, db_pool):
    for _ in range(3):
        await _event_aged(db_pool, seeded_domain, 40)
    await _event_aged(db_pool, seeded_domain, 5)

    deleted = await retention_service.delete_expired(batch_size=2)

    assert deleted["events"] >= 3
    async with db_pool.acquire() as conn:
        left = await conn.fetchval(
            "SELECT COUNT(*)::int FROM events WHERE domain_id = $1", seeded_domain
        )
    assert left == 1


async def test_dry_run_deletes_nothing(seeded_domain, db_pool):
    await _event_aged(db_pool, seeded_domain, 40)

    result = await apply_retention("dry_run")

    assert result["mode"] == "dry_run" and _events(result, "free") >= 1
    async with db_pool.acquire() as conn:
        assert await conn.fetchval(
            "SELECT COUNT(*)::int FROM events WHERE domain_id = $1", seeded_domain
        ) == 1
        logged = await conn.fetchval(
            "SELECT COUNT(*)::int FROM admin_audit_log WHERE action = 'retention.dry_run'"
        )
    assert logged >= 1


@pytest.fixture
def job_name():
    return f"test-job-{uuid.uuid4().hex}"


async def test_a_daily_job_runs_once_per_interval(db_pool, job_name):
    from datetime import timedelta

    runs: list[int] = []

    async def job():
        runs.append(1)
        return {"ok": True}

    assert await run_if_due(job_name, timedelta(hours=23), job) is True
    assert await run_if_due(job_name, timedelta(hours=23), job) is False
    assert runs == [1]
    async with db_pool.acquire() as conn:
        await conn.execute("DELETE FROM job_runs WHERE name = $1", job_name)


async def test_a_job_held_by_another_instance_does_not_run(db_pool, job_name):
    from datetime import timedelta

    async def job():
        raise AssertionError("ran while another instance held the lock")

    async with db_pool.acquire() as other_instance:
        await other_instance.execute("SELECT pg_advisory_lock(hashtext($1))", job_name)
        try:
            assert await run_if_due(job_name, timedelta(hours=23), job) is False
        finally:
            await other_instance.execute("SELECT pg_advisory_unlock(hashtext($1))", job_name)
