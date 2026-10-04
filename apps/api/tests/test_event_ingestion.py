"""Postgres round-trip for ingestion — session upsert, then event batch insert.

This is the one hop `test_tracker.py` and `test_collect.py` cannot reach: does
what the tracker sends actually *persist*? Both of those stop at the queue.

The tracker generates a UUID-v4-formatted `visitorId`/`sessionId` client-side
(`generateId()` in `tracker/src/index.ts`) and sends them on every event. Those
values are *natural* keys, but the schema's foreign keys point at surrogate ids:

    sessions.id          UUID PK, server-generated (gen_random_uuid())
    sessions.session_id  VARCHAR(100)       <- client session id lands here
    sessions.visitor_id  UUID FK -> visitors(id)
    events.session_id    UUID FK -> sessions(id)   <- NOT sessions.session_id
    events.visitor_id    UUID FK -> visitors(id)

Writing the client ids straight into the foreign key columns violated those
constraints on every batch, so the transaction rolled back and — because the
worker RPOP'd the events before persisting — the data was lost. The ingestion path
now upserts `visitors` first and resolves both surrogates, which is what these
tests pin down.

Skipped unless `THRAVIC_TEST_DATABASE_URL` is set. Nothing here reads the app's
configured `DATABASE_URL`, so the suite must be *explicitly* pointed at a database
to run them — including at production, which is why it takes a named variable.
"""

from __future__ import annotations

import os
import uuid

import asyncpg
import pytest

from app import db as db_module
from app.db import _init_connection, _prepare_dsn, _ssl_setting
from app.services import event_service, session_service
from app.services.session_service import classify_source

TEST_DSN = os.getenv("THRAVIC_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
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


def _tracker_payload(domain_id: str) -> dict:
    """Exactly what `collect.py` inserts, i.e. what the tracker sends."""
    return {
        "domainId": domain_id,
        "sessionId": str(uuid.uuid4()),  # client-generated, UUID-shaped
        "visitorId": str(uuid.uuid4()),  # client-generated, UUID-shaped
        "eventId": str(uuid.uuid4()),  # client idempotency key
        "type": "pageview",
        "url": "https://ingest.example.invalid/landing",
        "referrer": None,
        "utmSource": None,
        "utmMedium": None,
        "utmCampaign": None,
        "data": {},
        "userAgent": "pytest",
        "screenWidth": 1920,
        "screenHeight": 1080,
        "language": "en-US",
        "country": "US",
        "region": None,
        "city": None,
        "sourceType": "direct",
    }


async def test_session_upsert_creates_visitor_and_persists_session(
    seeded_domain, db_pool
):
    payload = _tracker_payload(seeded_domain)

    session = await session_service.upsert(payload)

    assert session is not None
    assert session["session_id"] == payload["sessionId"]

    async with db_pool.acquire() as conn:
        visitor = await conn.fetchrow(
            "SELECT * FROM visitors WHERE visitor_id = $1 AND domain_id = $2",
            payload["visitorId"],
            seeded_domain,
        )

    assert visitor is not None, "the visitor row the session FK needs was not created"
    # The session points at the surrogate UUID, not at the client's string.
    assert session["visitor_id"] == visitor["id"]
    assert str(session["visitor_id"]) != payload["visitorId"]


async def test_event_batch_insert_persists_and_links_to_the_surrogates(
    seeded_domain, db_pool
):
    payload = _tracker_payload(seeded_domain)

    session = await session_service.upsert(payload)
    inserted = await event_service.batch_insert([payload])

    assert inserted == 1

    async with db_pool.acquire() as conn:
        event = await conn.fetchrow(
            "SELECT * FROM events WHERE domain_id = $1", seeded_domain
        )

    assert event is not None
    assert event["type"] == "pageview"
    assert event["url"] == payload["url"]
    # Both foreign keys resolved to the server-generated ids.
    assert event["session_id"] == session["id"]
    assert event["visitor_id"] == session["visitor_id"]


async def test_repeat_session_upsert_bumps_pageviews_without_duplicating(
    seeded_domain, db_pool
):
    payload = _tracker_payload(seeded_domain)

    first = await session_service.upsert(payload)
    second = await session_service.upsert(payload)

    assert first["id"] == second["id"]
    assert second["pageviews"] == first["pageviews"] + 1

    async with db_pool.acquire() as conn:
        sessions = await conn.fetchval(
            "SELECT count(*) FROM sessions WHERE domain_id = $1", seeded_domain
        )
        visitors = await conn.fetchval(
            "SELECT count(*) FROM visitors WHERE domain_id = $1", seeded_domain
        )

    # `count(*)` is int8, and the pool's codec returns it as text (node-postgres
    # bigint semantics), so compare numerically.
    assert int(sessions) == 1
    assert int(visitors) == 1


async def test_a_retried_event_id_is_stored_once(seeded_domain, db_pool):
    """The tracker retries failed batches; the idempotency key absorbs it."""
    payload = _tracker_payload(seeded_domain)

    assert await event_service.batch_insert([payload]) == 1
    # The same batch delivered again — exactly what a retry produces.
    assert await event_service.batch_insert([payload]) == 0

    async with db_pool.acquire() as conn:
        stored = await conn.fetchval(
            "SELECT count(*) FROM events WHERE domain_id = $1", seeded_domain
        )

    assert int(stored) == 1


async def test_distinct_event_ids_are_both_stored(seeded_domain, db_pool):
    payloads = [_tracker_payload(seeded_domain), _tracker_payload(seeded_domain)]

    assert await event_service.batch_insert(payloads) == 2


# ── Schema/application contract ──────────────────────────────────────────────
# Both of these failed in production before the constraints were widened: the
# API accepted the value, Postgres rejected it, and the endpoint answered 500
# while /health stayed green. Nothing in the suite noticed, so these tie the
# CHECK constraints to what the application actually emits.


async def test_every_event_type_the_api_accepts_is_storable(seeded_domain):
    """`events.type` must accept every type `collect.py` validates."""
    from app.routers.collect import EVENT_TYPES

    for event_type in EVENT_TYPES:
        payload = {**_tracker_payload(seeded_domain), "type": event_type}
        assert await event_service.batch_insert([payload]) == 1, event_type


async def test_every_source_type_the_app_emits_is_storable(seeded_domain):
    """`sessions.source_type` must accept every value `classify_source` returns."""
    emitted = {
        classify_source("https://www.google.com/", None, None),  # search engine
        classify_source("https://twitter.com/", None, None),  # social network
        classify_source("https://news.ycombinator.com/", None, None),  # referral
        classify_source(None, "newsletter", "email"),  # email
        classify_source(None, "google", "cpc"),  # paid
        classify_source(None, None, None),  # direct
    }
    assert emitted == {"organic", "social", "referral", "email", "paid", "direct"}

    for source_type in emitted:
        payload = {**_tracker_payload(seeded_domain), "sourceType": source_type}
        assert await session_service.upsert(payload) is not None, source_type
