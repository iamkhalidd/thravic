"""rrweb screen recordings: upload, storage as compressed chunks, read-back.

The tracker uploads rrweb events (`{"format": "rrweb", "events": [...]}`), as
JSON or — when the page is closing — as a text/plain beacon. Each upload is one
gzip-compressed `recording_chunks` row; reading a recording splices the chunks
back into one JSON array.
"""

from __future__ import annotations

import json
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.middleware.blocklist_gate import blocklist_gate
from app.middleware.settings_gate import tracking_gate
from app.routers import collect as collect_routes
from app.services import domain_service, recording_service
from tests.conftest import requires_test_db

URL = "https://ingest.example.invalid/landing"
TRACKING_ID = "trk_screen"


def _events(start_ms: int, count: int) -> list[dict]:
    """rrweb-shaped events one second apart: a full snapshot, then mouse moves."""
    events = [{"type": 2, "timestamp": start_ms, "data": {"node": {"type": 0}}}]
    events += [
        {"type": 3, "timestamp": start_ms + i * 1000, "data": {"source": 1, "positions": []}}
        for i in range(1, count)
    ]
    return events


# ── Storage (Postgres) ─────────────────────────────────────────────────────


@requires_test_db
async def test_uploads_are_stored_as_chunks_and_read_back_in_order(seeded_domain, db_pool):
    recording = await recording_service.create(seeded_domain, None, URL)
    first, second = _events(1_700_000_000_000, 3), _events(1_700_000_005_000, 2)

    assert await recording_service.append_rrweb_events(recording["id"], first)
    assert await recording_service.append_rrweb_events(recording["id"], second)

    events = json.loads(await recording_service.rrweb_events_json(recording["id"]))
    row = await recording_service.get_by_id_light(recording["id"])

    assert events == first + second
    assert row["format"] == "rrweb"
    assert row["events_count"] == 5
    # 1_700_000_000_000 .. 1_700_000_006_000
    assert row["duration"] == 6
    assert row["ended_at"] is not None


@requires_test_db
async def test_an_empty_recording_reads_as_an_empty_array(seeded_domain, db_pool):
    recording = await recording_service.create(seeded_domain, None, URL)

    assert await recording_service.rrweb_events_json(recording["id"]) == "[]"


@requires_test_db
async def test_uploads_past_the_size_cap_are_dropped(seeded_domain, db_pool, monkeypatch):
    recording = await recording_service.create(seeded_domain, None, URL)
    assert await recording_service.append_rrweb_events(recording["id"], _events(0, 2))

    monkeypatch.setattr(recording_service, "MAX_RECORDING_BYTES", 1)

    assert not await recording_service.append_rrweb_events(recording["id"], _events(5000, 2))
    events = json.loads(await recording_service.rrweb_events_json(recording["id"]))
    row = await recording_service.get_by_id_light(recording["id"])
    assert len(events) == 2
    assert row["events_count"] == 2


@requires_test_db
async def test_deleting_a_recording_removes_its_chunks(seeded_domain, db_pool):
    recording = await recording_service.create(seeded_domain, None, URL)
    await recording_service.append_rrweb_events(recording["id"], _events(0, 2))

    await recording_service.remove(recording["id"])

    async with db_pool.acquire() as conn:
        left = await conn.fetchval(
            "SELECT COUNT(*)::int FROM recording_chunks WHERE recording_id = $1", recording["id"]
        )
    assert left == 0


# ── Collector route (no database) ──────────────────────────────────────────


@pytest.fixture
def upload(monkeypatch):
    """The collector with a fake domain and recording; returns what was stored."""
    domain_id = uuid.uuid4()
    recording_id = uuid.uuid4()
    stored: list[list[dict]] = []

    async def _get_by_tracking_id(tracking_id):
        return {"id": domain_id, "user_id": uuid.uuid4(), "settings": {}} if (
            tracking_id == TRACKING_ID
        ) else None

    async def _get_by_id_light(rid):
        return {"id": recording_id, "domain_id": domain_id} if rid == str(recording_id) else None

    async def _append(_rid, events):
        stored.append(events)
        return True

    monkeypatch.setattr(domain_service, "get_by_tracking_id", _get_by_tracking_id)
    monkeypatch.setattr(recording_service, "get_by_id_light", _get_by_id_light)
    monkeypatch.setattr(recording_service, "append_rrweb_events", _append)

    app.dependency_overrides[tracking_gate] = lambda: None
    app.dependency_overrides[blocklist_gate] = lambda: None
    with TestClient(app) as client:
        yield client, f"/api/collect/{TRACKING_ID}/recording/{recording_id}/events", stored
    app.dependency_overrides.clear()


def test_a_text_plain_beacon_upload_is_stored(upload):
    client, url, stored = upload
    events = _events(1000, 3)

    response = client.post(
        url,
        content=json.dumps({"format": "rrweb", "events": events}),
        headers={"content-type": "text/plain;charset=UTF-8"},
    )

    assert response.status_code == 202
    assert response.json() == {"success": True, "appended": 3}
    assert stored == [events]


def test_events_without_a_numeric_type_are_rejected(upload):
    client, url, stored = upload

    response = client.post(
        url, json={"format": "rrweb", "events": [{"type": "x", "timestamp": 1}]}
    )

    assert response.status_code == 400
    assert stored == []


def test_an_upload_over_the_size_limit_is_refused(upload, monkeypatch):
    client, url, stored = upload
    monkeypatch.setattr(collect_routes, "MAX_RRWEB_BATCH_BYTES", 100)

    response = client.post(url, json={"format": "rrweb", "events": _events(0, 20)})

    assert response.status_code == 413
    assert stored == []


def test_a_full_recording_reports_the_upload_as_dropped(upload, monkeypatch):
    client, url, _ = upload

    async def _full(_rid, _events):
        return False

    monkeypatch.setattr(recording_service, "append_rrweb_events", _full)

    response = client.post(url, json={"format": "rrweb", "events": _events(0, 2)})

    assert response.status_code == 202
    assert response.json() == {"success": True, "dropped": "recording_size_limit"}


def test_the_recorder_script_is_served(upload):
    client, _, _ = upload

    response = client.get("/recorder.js")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/javascript")
    assert b"__TF_RRWEB__" in response.content
    # Customer sites load it cross-origin; `same-origin` made browsers block it.
    assert response.headers.get("cross-origin-resource-policy") != "same-origin"
    assert client.get(
        "/recorder.js", headers={"if-none-match": response.headers["etag"]}
    ).status_code == 304
