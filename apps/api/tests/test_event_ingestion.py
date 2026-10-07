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

import uuid
from datetime import UTC, datetime, timedelta

from app.db import query_one
from app.services import event_service, session_service
from app.services.session_service import classify_source
from tests.conftest import requires_test_db

pytestmark = requires_test_db


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


async def test_session_upsert_creates_visitor_and_persists_session(seeded_domain, db_pool):
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


async def test_event_batch_insert_persists_and_links_to_the_surrogates(seeded_domain, db_pool):
    payload = _tracker_payload(seeded_domain)

    session = await session_service.upsert(payload)
    inserted = await event_service.batch_insert([payload])

    assert inserted == 1

    async with db_pool.acquire() as conn:
        event = await conn.fetchrow("SELECT * FROM events WHERE domain_id = $1", seeded_domain)

    assert event is not None
    assert event["type"] == "pageview"
    assert event["url"] == payload["url"]
    # Both foreign keys resolved to the server-generated ids.
    assert event["session_id"] == session["id"]
    assert event["visitor_id"] == session["visitor_id"]


async def test_repeat_session_upsert_does_not_inflate_pageviews(seeded_domain, db_pool):
    payload = _tracker_payload(seeded_domain)

    first = await session_service.upsert(payload)
    second = await session_service.upsert(payload)

    assert first["id"] == second["id"]
    # `pageviews` is derived by event ingestion now. The collector upserts once per
    # event in a batch, so incrementing here invented a pageview per event — a
    # single page load that also sent a custom event was stored as `pageviews = 2`.
    assert second["pageviews"] == 0

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


async def _pageviews(domain_id: str, session_id: str) -> int:
    row = await query_one(
        "SELECT pageviews FROM sessions WHERE domain_id = $1 AND session_id = $2",
        domain_id,
        session_id,
    )
    return int((row or {}).get("pageviews") or 0)


async def test_pageviews_counts_pageviews_not_every_event(seeded_domain):
    """A page load sends a pageview plus custom events — that is ONE pageview."""
    payload = _tracker_payload(seeded_domain)
    await session_service.upsert(payload)

    # The shape the tracker really produces for a single visit.
    click = {**payload, "eventId": str(uuid.uuid4()), "type": "click"}
    perf = {**payload, "eventId": str(uuid.uuid4()), "type": "custom"}

    assert await event_service.batch_insert([payload, click, perf]) == 3

    assert await _pageviews(seeded_domain, payload["sessionId"]) == 1


async def test_replayed_batch_does_not_inflate_pageviews(seeded_domain):
    """The tracker re-sends until acknowledged; a replay must not add pageviews."""
    payload = _tracker_payload(seeded_domain)
    await session_service.upsert(payload)

    assert await event_service.batch_insert([payload]) == 1
    assert await _pageviews(seeded_domain, payload["sessionId"]) == 1

    # Exactly what the beacon path produces: the same events, delivered again.
    assert await event_service.batch_insert([payload]) == 0
    assert await _pageviews(seeded_domain, payload["sessionId"]) == 1


async def test_pageviews_counts_distinct_pageview_events(seeded_domain):
    payload = _tracker_payload(seeded_domain)
    await session_service.upsert(payload)

    second = {**payload, "eventId": str(uuid.uuid4())}
    click = {**payload, "eventId": str(uuid.uuid4()), "type": "click"}

    assert await event_service.batch_insert([payload, second, click]) == 3

    assert await _pageviews(seeded_domain, payload["sessionId"]) == 2


async def test_bounce_rate_treats_a_single_pageview_session_as_a_bounce(
    seeded_domain,
):
    """`pageviews <= 1` is the bounce test, so the counter feeds a public metric.

    While the counter counted events, this rate was pinned at 0.00% in production.
    """
    payload = _tracker_payload(seeded_domain)
    await session_service.upsert(payload)
    await event_service.batch_insert([payload])

    now = datetime.now(UTC)
    rate = await session_service.get_bounce_rate(
        seeded_domain, now - timedelta(days=1), now + timedelta(days=1)
    )

    assert rate == 100.0


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


# ── The same contract for subscriptions ──────────────────────────────────────
# `subscriptions.plan` and the unique constraint on `user_id` are both load-bearing
# for payments, and both had drifted from what the application needs.


async def _user_id_for(domain_id: str) -> str:
    row = await query_one("SELECT user_id FROM domains WHERE id = $1", domain_id)
    return str(row["user_id"])


async def test_every_plan_the_app_sells_is_storable(seeded_domain, db_pool):
    """`subscriptions.plan` must accept every plan `plans.PLAN_LIMITS` offers.

    Production's CHECK listed `('free','growth','pro','enterprise')` while the app
    sells free/pro/**agency**, so an agency purchase could not be stored at all:
    the upgrade failed the constraint and the customer got no plan.
    """
    from app.plans import PLAN_LIMITS

    user_id = await _user_id_for(seeded_domain)
    assert PLAN_LIMITS, "no plans are configured"

    for plan in PLAN_LIMITS:
        async with db_pool.acquire() as conn:
            await conn.execute("DELETE FROM subscriptions WHERE user_id = $1", user_id)
            stored = await conn.fetchval(
                """
                INSERT INTO subscriptions (user_id, plan, events_limit, domains_limit)
                VALUES ($1, $2, 1000, 1)
                RETURNING plan
                """,
                user_id,
                plan,
            )
        assert stored == plan, f"plan {plan!r} was rejected by the schema"


async def test_the_payment_upsert_succeeds_and_updates_on_conflict(seeded_domain, db_pool):
    """`_upgrade_subscription` upserts `ON CONFLICT (user_id)`.

    That needs a unique constraint on `subscriptions.user_id`. Production had one
    but no migration created it, so a database built from migrations raised
    "no unique or exclusion constraint matching the ON CONFLICT specification" and
    500'd every successful charge — the customer paid and got nothing.
    """
    user_id = await _user_id_for(seeded_domain)

    async def _upsert(plan: str) -> str:
        async with db_pool.acquire() as conn:
            return await conn.fetchval(
                """
                INSERT INTO subscriptions
                    (user_id, plan, events_limit, domains_limit)
                VALUES ($1, $2, 1000, 1)
                ON CONFLICT (user_id) DO UPDATE SET
                    plan       = $2,
                    updated_at = NOW()
                RETURNING plan
                """,
                user_id,
                plan,
            )

    assert await _upsert("pro") == "pro"
    # The second call takes the DO UPDATE branch rather than raising.
    assert await _upsert("agency") == "agency"

    async with db_pool.acquire() as conn:
        rows = await conn.fetchval("SELECT count(*) FROM subscriptions WHERE user_id = $1", user_id)
    assert int(rows) == 1, "the upsert must update in place, not insert a second row"
