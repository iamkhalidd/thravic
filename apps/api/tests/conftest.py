"""Shared fixtures for the Postgres round-trip tests.

These run only against a disposable, migrated database named by
`THRAVIC_TEST_DATABASE_URL`; modules opt in with `pytestmark = requires_test_db`.
Nothing here reads the app's configured `DATABASE_URL`.
"""

from __future__ import annotations

import os
import uuid

import asyncpg
import pytest

from app import db as db_module
from app.db import _init_connection, _prepare_dsn, _ssl_setting

TEST_DSN = os.getenv("THRAVIC_TEST_DATABASE_URL")

requires_test_db = pytest.mark.skipif(
    not TEST_DSN,
    reason="set THRAVIC_TEST_DATABASE_URL to a disposable, migrated database",
)

# The schema the ingestion path needs; if these are missing the database was
# never migrated and every failure below would be the wrong one.
_REQUIRED_TABLES = ("users", "domains", "visitors", "sessions", "events")


@pytest.fixture
async def db_pool():
    """Own asyncpg pool, wired into `app.db` for the duration of one test."""
    dsn, ssl_required = _prepare_dsn(TEST_DSN)
    pool = await asyncpg.create_pool(
        dsn=dsn,
        ssl=_ssl_setting(ssl_required),
        min_size=1,
        max_size=2,
        init=_init_connection,
    )
    db_module.pool = pool
    try:
        async with pool.acquire() as conn:
            missing = [
                table
                for table in _REQUIRED_TABLES
                if await conn.fetchval("SELECT to_regclass($1)", f"public.{table}") is None
            ]
        if missing:
            pytest.skip(
                "disposable database is not migrated (missing: "
                + ", ".join(missing)
                + ") — run `alembic upgrade head` against it first"
            )

        yield pool
    finally:
        db_module.pool = None
        await pool.close()


@pytest.fixture
async def seeded_domain(db_pool):
    """A throwaway user + domain, removed (cascade) on teardown."""
    user_id = uuid.uuid4()
    domain_id = uuid.uuid4()

    async with db_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO users (id, email, name) VALUES ($1, $2, $3)",
            user_id,
            f"ingest-{uuid.uuid4().hex}@example.invalid",
            "Ingestion Test",
        )
        await conn.execute(
            "INSERT INTO domains (id, user_id, domain, name, tracking_id) "
            "VALUES ($1, $2, $3, $4, $5)",
            domain_id,
            user_id,
            "ingest.example.invalid",
            "Ingestion",
            f"trk_{uuid.uuid4().hex[:16]}",
        )

    try:
        yield str(domain_id)
    finally:
        async with db_pool.acquire() as conn:
            # Cascades to domains -> visitors/sessions/events.
            await conn.execute("DELETE FROM users WHERE id = $1", user_id)


@pytest.fixture
async def make_plan(db_pool):
    """Create throwaway plans with chosen limits; removed on teardown.

    Limits come from the plan's definition (`plan_catalog`), not from the
    subscription row, so a test wanting a 10-event limit needs a plan with one.
    """
    from app.services import plan_catalog

    created: list[str] = []

    async def _make(**fields) -> str:
        plan_id = f"test_{uuid.uuid4().hex[:10]}"
        values = {
            "name": "Test plan",
            "price": 1000,
            "events_limit": 1000,
            "domains_limit": 3,
            "features": [],
            **fields,
        }
        columns = ", ".join(["id", *values])
        params = ", ".join(f"${i}" for i in range(1, len(values) + 2))
        async with db_pool.acquire() as conn:
            await conn.execute(
                f"INSERT INTO plans ({columns}) VALUES ({params})", plan_id, *values.values()
            )
        created.append(plan_id)
        plan_catalog.invalidate()
        return plan_id

    yield _make

    async with db_pool.acquire() as conn:
        await conn.execute("DELETE FROM plans WHERE id = ANY($1::text[])", created)
        await conn.execute(
            "DELETE FROM data_retention_policies WHERE plan = ANY($1::text[])", created
        )
    plan_catalog.invalidate()
