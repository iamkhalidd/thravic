"""Postgres round-trip for session recordings — linking a recording to its session.

`session_recordings.session_id` is a foreign key to `sessions.id`, the
server-generated surrogate. The tracker only knows its own client-side session id
(`sessions.session_id`), and that is what `POST /recording/start` receives.
Writing it straight into the FK column violated the constraint, so every
tracker-started recording failed with a 500 and nothing was saved.

The tracker also starts recording on init, while the first pageview waits in the
batch queue for up to `batchInterval` — on a session's first page the `sessions`
row usually does not exist yet. The client id is therefore kept on the recording
and the link is resolved again when the recording ends.

Skipped unless `THRAVIC_TEST_DATABASE_URL` is set (see `test_event_ingestion.py`).
"""

from __future__ import annotations

import uuid

from app.services import recording_service, session_service
from tests.conftest import requires_test_db
from tests.test_event_ingestion import _tracker_payload

pytestmark = requires_test_db

URL = "https://ingest.example.invalid/landing"


async def test_start_links_to_an_existing_session(seeded_domain, db_pool):
    payload = _tracker_payload(seeded_domain)
    session = await session_service.upsert(payload)

    recording = await recording_service.create(seeded_domain, payload["sessionId"], URL)

    assert recording is not None
    assert recording["session_id"] == session["id"]
    assert recording["client_session_id"] == payload["sessionId"]


async def test_start_before_the_session_exists_links_on_end(seeded_domain, db_pool):
    payload = _tracker_payload(seeded_domain)

    # Recording starts first; the pageview batch has not been flushed yet.
    recording = await recording_service.create(seeded_domain, payload["sessionId"], URL)
    assert recording is not None
    assert recording["session_id"] is None

    session = await session_service.upsert(payload)
    ended = await recording_service.end_recording(recording["id"])

    assert ended["session_id"] == session["id"]


async def test_start_without_a_session_id(seeded_domain, db_pool):
    recording = await recording_service.create(seeded_domain, None, URL)

    assert recording is not None
    assert recording["session_id"] is None
    assert recording["client_session_id"] is None


async def test_session_id_from_another_domain_is_not_linked(seeded_domain, db_pool):
    payload = _tracker_payload(seeded_domain)
    await session_service.upsert(payload)

    other_domain = str(uuid.uuid4())
    async with db_pool.acquire() as conn:
        user_id = await conn.fetchval("SELECT user_id FROM domains WHERE id = $1", seeded_domain)
        await conn.execute(
            "INSERT INTO domains (id, user_id, domain, name, tracking_id) "
            "VALUES ($1, $2, $3, $4, $5)",
            other_domain,
            user_id,
            "other.example.invalid",
            "Other",
            f"trk_{uuid.uuid4().hex[:16]}",
        )

    recording = await recording_service.create(other_domain, payload["sessionId"], URL)

    assert recording["session_id"] is None
