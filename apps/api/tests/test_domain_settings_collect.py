"""Dashboard tracking settings, as the collector and the tracker see them.

The settings endpoint used to echo its body without storing it, so the switches
did nothing. They now decide what the collector stores (whatever the client
sends) and what `GET /api/collect/{trackingId}/config` tells the tracker.
Session recording also needs the owner's plan to include recordings.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.middleware.blocklist_gate import blocklist_gate
from app.middleware.settings_gate import tracking_gate
from app.plans import PLAN_FEATURES
from app.routers import collect as collect_routes
from app.routers import domains as domains_routes
from app.services import domain_service, event_service, plan_service, session_service
from app.services.plan_service import Plan

TRACKING_ID = "trk_settings"


@pytest.fixture
def stored(monkeypatch):
    batches: list[list[dict]] = []

    async def _upsert(_params):
        return {"id": uuid.uuid4()}

    async def _batch_insert(events, stored=None):
        batches.append(events)
        if stored is not None:
            stored.extend(events)
        return len(events)

    async def _no_webhooks(*_args, **_kwargs):
        return None

    monkeypatch.setattr(session_service, "upsert", _upsert)
    monkeypatch.setattr(event_service, "batch_insert", _batch_insert)
    monkeypatch.setattr(collect_routes, "check_ip", lambda _ip: {})
    monkeypatch.setattr(collect_routes.webhook_service, "trigger_for_events", _no_webhooks)
    monkeypatch.setattr(collect_routes.webhook_service, "trigger_webhooks", _no_webhooks)
    return batches


@pytest.fixture
def site(monkeypatch):
    """A domain whose stored settings and owner plan a test can set."""
    record = {
        "id": uuid.uuid4(),
        "user_id": uuid.uuid4(),
        "tracking_id": TRACKING_ID,
        "settings": {},
        "plan": "pro",
        "over_limit": False,
    }

    async def _get_by_tracking_id(tracking_id):
        return record if tracking_id == TRACKING_ID else None

    async def _owner_plan(_domain_id):
        name = record["plan"]
        return Plan("owner", name, PLAN_FEATURES[name], 100_000, 3)

    monkeypatch.setattr(domain_service, "get_by_tracking_id", _get_by_tracking_id)
    async def _over_event_limit(_owner_id):
        return record["over_limit"]

    monkeypatch.setattr(plan_service, "owner_plan", _owner_plan)
    async def _site_paused(_owner_id, _domain_id):
        return record.get("paused", False)

    monkeypatch.setattr(plan_service, "over_event_limit", _over_event_limit)
    monkeypatch.setattr(plan_service, "site_paused", _site_paused)
    return record


@pytest.fixture
def client():
    app.dependency_overrides[tracking_gate] = lambda: None
    app.dependency_overrides[blocklist_gate] = lambda: None
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _event(event_type):
    return {
        "type": event_type,
        "url": "https://example.com/",
        "visitorId": str(uuid.uuid4()),
        "sessionId": str(uuid.uuid4()),
        "eventId": str(uuid.uuid4()),
    }


def test_switched_off_types_are_acknowledged_but_not_stored(client, site, stored):
    site["settings"] = {"trackClicks": False}

    single = client.post(f"/api/collect/{TRACKING_ID}", json=_event("click"))
    batch = client.post(
        f"/api/collect/{TRACKING_ID}/batch",
        json={"events": [_event("pageview"), _event("click"), _event("scroll")]},
    )

    # 202 so the tracker drops them from its queue instead of retrying forever
    assert single.status_code == 202
    assert batch.json() == {"success": True, "processed": 2}
    assert [e["type"] for e in stored[0]] == ["pageview", "scroll"]


def test_defaults_store_every_type(client, site, stored):
    client.post(
        f"/api/collect/{TRACKING_ID}/batch",
        json={"events": [_event(t) for t in ("pageview", "click", "scroll", "form")]},
    )

    assert len(stored[0]) == 4


def test_config_reports_the_dashboard_settings(client, site, stored):
    site["settings"] = {"trackScrolls": False, "sessionRecording": True}

    response = client.get(f"/api/collect/{TRACKING_ID}/config")

    assert response.json() == {
        "trackClicks": True,
        "trackScrolls": False,
        "trackForms": True,
        "trackRecordings": True,
        "recordingConsentPrompt": True,
        "recordingSampleRate": 100,
    }
    assert "max-age=60" in response.headers["cache-control"]


def test_recording_needs_the_plan_as_well_as_the_setting(client, site, stored):
    site["settings"] = {"sessionRecording": True}
    site["plan"] = "free"

    config = client.get(f"/api/collect/{TRACKING_ID}/config").json()
    start = client.post(
        f"/api/collect/{TRACKING_ID}/recording/start",
        json={"url": "https://example.com/", "sessionId": str(uuid.uuid4())},
    )

    assert config["trackRecordings"] is False
    assert start.status_code == 403


def test_recording_is_refused_when_switched_off(client, site, stored):
    response = client.post(
        f"/api/collect/{TRACKING_ID}/recording/start",
        json={"url": "https://example.com/", "sessionId": str(uuid.uuid4())},
    )

    assert response.status_code == 403
    assert response.json() == {"error": "Session recording is not enabled for this site"}


def test_recording_is_refused_over_the_monthly_limit(client, site, stored):
    site["settings"] = {"sessionRecording": True}
    site["over_limit"] = True

    response = client.post(
        f"/api/collect/{TRACKING_ID}/recording/start",
        json={"url": "https://example.com/", "sessionId": str(uuid.uuid4())},
    )

    assert response.status_code == 403
    assert response.json() == {"error": "This site has reached its monthly event limit"}


def test_config_reports_the_sample_rate(client, site, stored):
    site["settings"] = {"sessionRecording": True, "recordingSampleRate": 25}

    config = client.get(f"/api/collect/{TRACKING_ID}/config").json()

    assert config["recordingSampleRate"] == 25


def test_a_stored_value_outside_the_choices_falls_back_to_the_default():
    domain = {"settings": {"recordingSampleRate": 7, "recordingDailyLimit": "lots"}}

    settings = domain_service.effective_settings(domain)

    assert settings["recordingSampleRate"] == 100
    assert settings["recordingDailyLimit"] == 50


def _start(client):
    return client.post(
        f"/api/collect/{TRACKING_ID}/recording/start",
        json={"url": "https://example.com/", "sessionId": str(uuid.uuid4())},
    )


def test_recording_is_refused_once_the_daily_limit_is_reached(
    client, site, stored, monkeypatch
):
    site["settings"] = {"sessionRecording": True, "recordingDailyLimit": 25}
    created: list[str] = []

    async def _started_today(_domain_id):
        return 25

    async def _create(*_args):
        created.append("recording")
        return {"id": uuid.uuid4(), "started_at": None}

    monkeypatch.setattr(collect_routes.recording_service, "count_started_today", _started_today)
    monkeypatch.setattr(collect_routes.recording_service, "create", _create)

    response = _start(client)

    assert response.status_code == 429
    assert response.json() == {"error": "This site has reached its daily recording limit"}
    assert created == []


def test_recording_starts_below_the_daily_limit(client, site, stored, monkeypatch):
    site["settings"] = {"sessionRecording": True, "recordingDailyLimit": 25}

    async def _started_today(_domain_id):
        return 24

    async def _create(*_args):
        return {"id": uuid.uuid4(), "started_at": None}

    monkeypatch.setattr(collect_routes.recording_service, "count_started_today", _started_today)
    monkeypatch.setattr(collect_routes.recording_service, "create", _create)

    assert _start(client).status_code == 201


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ({"recordingSampleRate": 25}, {"recordingSampleRate": 25}),
        ({"recordingDailyLimit": 1000}, {"recordingDailyLimit": 1000}),
        ({"sessionRecording": False}, {"sessionRecording": False}),
    ],
)
def test_settings_accept_the_listed_values(body, expected):
    assert domains_routes._validate_settings(body) == (expected, None)


@pytest.mark.parametrize(
    "body",
    [
        {"recordingSampleRate": 33},
        {"recordingSampleRate": True},
        {"recordingDailyLimit": "100"},
        {"recordingDailyLimit": 100000},
    ],
)
def test_settings_refuse_other_limit_values(body):
    settings, message = domains_routes._validate_settings(body)

    assert settings is None
    assert "must be one of" in message


def test_a_paused_site_is_acknowledged_but_not_stored(client, site, stored):
    """Over the owner's website limit after a lapsed plan: kept, not collecting."""
    site["paused"] = True
    site["settings"] = {"sessionRecording": True}

    single = client.post(f"/api/collect/{TRACKING_ID}", json=_event("pageview"))
    batch = client.post(f"/api/collect/{TRACKING_ID}/batch", json={"events": [_event("click")]})
    recording = client.post(f"/api/collect/{TRACKING_ID}/recording/start", json={})

    assert single.status_code == 202 and single.json()["dropped"] == "site_paused"
    assert batch.json() == {"success": True, "processed": 0, "dropped": "site_paused"}
    assert recording.status_code == 403
    assert stored == []
