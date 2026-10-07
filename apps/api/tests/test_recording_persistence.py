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


async def _recording_on(domain_id: str, db_pool, screen_width: int | None, duration: int | None):
    """A recording whose session has `screen_width`, with `duration` seconds."""
    payload = {**_tracker_payload(domain_id), "screenWidth": screen_width}
    await session_service.upsert(payload)
    recording = await recording_service.create(domain_id, payload["sessionId"], URL)
    async with db_pool.acquire() as conn:
        await conn.execute(
            "UPDATE session_recordings SET duration = $2 WHERE id = $1",
            recording["id"],
            duration,
        )
    return recording["id"]


async def test_list_filters_by_device_and_duration(seeded_domain, db_pool):
    phone_short = await _recording_on(seeded_domain, db_pool, 390, 10)
    tablet_medium = await _recording_on(seeded_domain, db_pool, 800, 60)
    desktop_long = await _recording_on(seeded_domain, db_pool, 1920, 600)
    in_progress = await _recording_on(seeded_domain, db_pool, 1920, None)

    async def ids(**filters):
        rows = await recording_service.list_by_domain(seeded_domain, 50, 0, **filters)
        count = await recording_service.count_by_domain(seeded_domain, **filters)
        assert count == len(rows), "pagination total disagrees with the filtered list"
        return {row["id"] for row in rows}

    assert await ids() == {phone_short, tablet_medium, desktop_long, in_progress}
    assert await ids(device="mobile") == {phone_short}
    assert await ids(device="tablet") == {tablet_medium}
    assert await ids(device="desktop") == {desktop_long, in_progress}
    assert await ids(duration="short") == {phone_short}
    assert await ids(duration="medium") == {tablet_medium}
    assert await ids(duration="long") == {desktop_long}
    assert await ids(device="desktop", duration="long") == {desktop_long}
    assert await ids(device="mobile", duration="long") == set()


async def test_list_reports_the_device_class(seeded_domain, db_pool):
    await _recording_on(seeded_domain, db_pool, 390, 10)
    await recording_service.create(seeded_domain, None, URL)  # no session at all

    rows = await recording_service.list_by_domain(seeded_domain, 50, 0)

    assert sorted(row["device"] for row in rows) == ["mobile", "unknown"]


async def test_appended_events_are_stored_as_events_not_one_string(seeded_domain, db_pool):
    """The jsonb codec encodes the list; encoding it twice stored a JSON string."""
    recording = await recording_service.create(seeded_domain, None, URL)

    await recording_service.append_events(
        recording["id"], [{"type": "mousemove", "timestamp": 2500, "data": {"x": 1, "y": 2}}]
    )
    stored = await recording_service.get_by_id(recording["id"])

    assert stored["recording_data"]["events"] == [
        {"type": "mousemove", "timestamp": 2500, "data": {"x": 1, "y": 2}}
    ]
    # Known from the events, before (or without) the end beacon.
    assert stored["duration"] == 3
    assert stored["events_count"] == 1
