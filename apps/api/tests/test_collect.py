"""`POST /api/collect/:trackingId` — the browser→API hop, over real HTTP.

`test_tracker.py` proves the script is *delivered*; this proves the script's very
next step works: a browser POSTs an event, the API resolves the domain from the
tracking id, validates the payload, and **writes it to Postgres before answering**
— there is no Redis queue in this path.

Postgres is stubbed at the service boundary (`session_service.upsert` /
`event_service.batch_insert`), which is exactly what this route owns. The real SQL
is covered by `test_event_ingestion.py`.
"""

from __future__ import annotations

import uuid

import asyncpg.exceptions
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.middleware.blocklist_gate import blocklist_gate
from app.middleware.settings_gate import tracking_gate
from app.routers import collect as collect_routes
from app.services import domain_service, event_service, session_service, webhook_service

TRACKING_ID = "trk_demo"
GEO = {"country": "NG", "region": "Lagos", "city": "Lagos"}


class _Writes:
    """What the route persisted, in call order."""

    def __init__(self) -> None:
        self.sessions: list[dict] = []
        self.events: list[list[dict]] = []


@pytest.fixture
def writes(monkeypatch):
    recorded = _Writes()

    async def _upsert(params):
        recorded.sessions.append(params)
        return {"id": uuid.uuid4()}

    async def _batch_insert(events):
        recorded.events.append(events)
        return len(events)

    monkeypatch.setattr(session_service, "upsert", _upsert)
    monkeypatch.setattr(event_service, "batch_insert", _batch_insert)
    monkeypatch.setattr(collect_routes, "check_ip", lambda _ip: GEO)
    return recorded


@pytest.fixture
def domain(monkeypatch):
    record = {"id": uuid.uuid4(), "tracking_id": TRACKING_ID, "domain": "example.com"}

    async def _get_by_tracking_id(tracking_id: str):
        return record if tracking_id == TRACKING_ID else None

    async def _no_webhooks(*_args, **_kwargs):
        return None

    monkeypatch.setattr(domain_service, "get_by_tracking_id", _get_by_tracking_id)
    monkeypatch.setattr(webhook_service, "trigger_webhooks", _no_webhooks)
    return record


@pytest.fixture
def client():
    # The tracking switch and the IP/referrer blocklist are separate concerns with
    # their own tests; allow them here so this one is about collection itself.
    app.dependency_overrides[tracking_gate] = lambda: None
    app.dependency_overrides[blocklist_gate] = lambda: None
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _pageview(**overrides):
    body = {
        "type": "pageview",
        "url": "https://example.com/landing",
        "referrer": "https://www.google.com/",
        "visitorId": str(uuid.uuid4()),
        "sessionId": str(uuid.uuid4()),
        "eventId": str(uuid.uuid4()),
    }
    body.update(overrides)
    return body


# ── Happy path ───────────────────────────────────────────────────────────────


def test_valid_pageview_is_persisted_and_acknowledged(client, domain, writes):
    response = client.post(f"/api/collect/{TRACKING_ID}", json=_pageview())

    assert response.status_code == 202
    assert response.json() == {"success": True}

    assert len(writes.sessions) == 1
    session = writes.sessions[0]
    assert session["domainId"] == domain["id"]
    # Google referrer with no UTM ⇒ organic search, and the referrer is the source
    assert session["sourceType"] == "organic"
    assert session["source"] == "https://www.google.com/"
    # Geo comes from the request IP lookup
    assert (session["country"], session["region"], session["city"]) == (
        "NG",
        "Lagos",
        "Lagos",
    )

    assert len(writes.events) == 1
    event = writes.events[0][0]
    assert event["domainId"] == domain["id"]
    assert event["eventId"] is not None
    assert event["type"] == "pageview"
    assert event["url"] == "https://example.com/landing"
    assert event["data"] == {}


def test_custom_event_data_is_persisted(client, domain, writes):
    response = client.post(
        f"/api/collect/{TRACKING_ID}",
        json=_pageview(type="custom", data={"plan": "pro", "seats": 3}),
    )

    assert response.status_code == 202
    assert writes.events[0][0]["data"] == {"plan": "pro", "seats": 3}


def test_the_batch_route_persists_every_event(client, domain, writes):
    response = client.post(
        f"/api/collect/{TRACKING_ID}/batch",
        json={"events": [_pageview(), _pageview(type="click")]},
    )

    assert response.status_code == 202
    assert response.json() == {"success": True, "processed": 2}
    assert len(writes.sessions) == 2
    assert len(writes.events[0]) == 2


# ── Rejections ───────────────────────────────────────────────────────────────


def test_an_event_without_an_id_is_still_accepted(client, domain, writes):
    """Older snippets do not send one; the column is optional."""
    body = _pageview()
    del body["eventId"]

    response = client.post(f"/api/collect/{TRACKING_ID}", json=body)

    assert response.status_code == 202
    assert writes.events[0][0]["eventId"] is None


def test_an_event_id_must_be_a_string(client, domain, writes):
    response = client.post(
        f"/api/collect/{TRACKING_ID}", json=_pageview(eventId=12345)
    )

    assert response.status_code == 400
    assert {issue["path"][0] for issue in response.json()["details"]} == {"eventId"}
    assert writes.events == []


def test_unknown_tracking_id_returns_404(client, domain, writes):
    response = client.post("/api/collect/trk_unknown", json=_pageview())

    assert response.status_code == 404
    assert response.json() == {"error": "Invalid tracking ID"}
    assert writes.sessions == []
    assert writes.events == []


def test_invalid_event_returns_400_with_details(client, domain, writes):
    body = _pageview()
    del body["url"]
    del body["visitorId"]

    response = client.post(f"/api/collect/{TRACKING_ID}", json=body)

    assert response.status_code == 400
    payload = response.json()
    assert payload["error"] == "Invalid event data"
    assert {issue["path"][0] for issue in payload["details"]} == {"url", "visitorId"}
    assert writes.events == []


def test_oversized_custom_data_returns_413(client, domain, writes):
    response = client.post(
        f"/api/collect/{TRACKING_ID}",
        json=_pageview(type="custom", data={"blob": "x" * 3000}),
    )

    assert response.status_code == 413
    assert "2KB" in response.json()["error"]
    assert writes.events == []


# ── Transient failure handling ───────────────────────────────────────────────


def test_a_transient_storage_failure_is_retried_and_absorbed(
    client, domain, writes, monkeypatch
):
    """A connection blip must not cost the event."""
    calls: list[int] = []

    async def flaky_batch_insert(events):
        calls.append(1)
        if len(calls) == 1:
            raise ConnectionError("connection reset by peer")
        return len(events)

    monkeypatch.setattr(event_service, "batch_insert", flaky_batch_insert)

    response = client.post(f"/api/collect/{TRACKING_ID}", json=_pageview())

    assert response.status_code == 202
    assert response.json() == {"success": True}
    assert calls == [1, 1]
    # The session write succeeded once and was never replayed.
    assert len(writes.sessions) == 1


def test_a_permanent_storage_failure_returns_500(client, domain, writes, monkeypatch):
    """A constraint violation is not retried, and the client is told."""
    calls: list[int] = []

    async def broken_batch_insert(events):
        calls.append(1)
        raise asyncpg.exceptions.UniqueViolationError("duplicate key")

    monkeypatch.setattr(event_service, "batch_insert", broken_batch_insert)

    response = client.post(f"/api/collect/{TRACKING_ID}", json=_pageview())

    assert response.status_code == 500
    assert calls == [1]
