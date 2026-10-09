"""Mobile app properties: created with a platform, collected like a website.

An app is a `domains` row whose `platform` is not 'web' and whose `domain` is the
bundle ID. Its SDK sends screen views as `pageview` events on `app://` URLs plus
device details a browser would carry in its user-agent. Recordings replay a web
page's DOM, so an app never records.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.middleware.auth import AuthUser, require_auth
from app.middleware.blocklist_gate import blocklist_gate
from app.middleware.settings_gate import tracking_gate
from app.plans import PLAN_FEATURES
from app.routers import collect as collect_routes
from app.services import domain_service, event_service, plan_service, session_service
from app.services.plan_service import Plan

USER_ID = "55555555-5555-4555-8555-555555555555"
TRACKING_ID = "trk_app"
GEO = {"country": "NG", "region": "Lagos", "city": "Lagos"}


# ── Creating an app property ─────────────────────────────────────────────────


@pytest.fixture
def account(monkeypatch):
    created: list[dict] = []

    async def _for_user(_user_id):
        return Plan(USER_ID, "pro", PLAN_FEATURES["pro"], 100_000, 10)

    async def _count_by_user(_user_id):
        return 0

    async def _create(user_id, domain, name, tracking_id, platform="web"):
        created.append({"domain": domain, "name": name, "platform": platform})
        return {"id": "d1", "domain": domain, "name": name, "tracking_id": tracking_id,
                "verified": False, "platform": platform}

    monkeypatch.setattr(plan_service, "for_user", _for_user)
    monkeypatch.setattr(domain_service, "count_by_user", _count_by_user)
    monkeypatch.setattr(domain_service, "create", _create)
    app.dependency_overrides[require_auth] = lambda: AuthUser(user_id=USER_ID, email="a@b.c")
    yield created
    app.dependency_overrides.clear()


def test_an_app_is_created_with_its_bundle_id_and_platform(account):
    with TestClient(app) as client:
        response = client.post(
            "/api/domains",
            json={"domain": "com.acme.shop", "name": "Acme Shop", "platform": "ios"},
        )

    assert response.status_code == 201
    assert response.json()["platform"] == "ios"
    assert account == [{"domain": "com.acme.shop", "name": "Acme Shop", "platform": "ios"}]


def test_without_a_platform_it_is_a_website(account):
    with TestClient(app) as client:
        response = client.post("/api/domains", json={"domain": "acme.com"})

    assert response.status_code == 201
    assert account[0]["platform"] == "web"


def test_an_unknown_platform_is_refused(account):
    with TestClient(app) as client:
        response = client.post(
            "/api/domains", json={"domain": "com.acme.shop", "platform": "windows"}
        )

    assert response.status_code == 400
    assert account == []


def test_an_app_needs_a_dotted_bundle_id(account):
    with TestClient(app) as client:
        response = client.post("/api/domains", json={"domain": "acmeshop", "platform": "android"})

    assert response.status_code == 400
    assert "bundle ID" in response.json()["error"]


# ── Collecting from an app ───────────────────────────────────────────────────


@pytest.fixture
def writes(monkeypatch):
    recorded = {"sessions": [], "events": []}

    async def _upsert(params):
        recorded["sessions"].append(params)
        return {"id": uuid.uuid4()}

    async def _batch_insert(events, stored=None):
        recorded["events"].extend(events)
        if stored is not None:
            stored.extend(events)
        return len(events)

    async def _no_webhooks(*_args, **_kwargs):
        return None

    monkeypatch.setattr(session_service, "upsert", _upsert)
    monkeypatch.setattr(event_service, "batch_insert", _batch_insert)
    monkeypatch.setattr(collect_routes, "check_ip", lambda _ip: GEO)
    monkeypatch.setattr(collect_routes.webhook_service, "trigger_for_events", _no_webhooks)
    monkeypatch.setattr(collect_routes.webhook_service, "trigger_webhooks", _no_webhooks)
    return recorded


@pytest.fixture
def app_site(monkeypatch):
    record = {
        "id": uuid.uuid4(),
        "user_id": uuid.uuid4(),
        "tracking_id": TRACKING_ID,
        "domain": "com.acme.shop",
        "platform": "cross",
        # Switched on in the dashboard, and the plan includes recordings.
        "settings": {"sessionRecording": True},
    }

    async def _get_by_tracking_id(tracking_id):
        return record if tracking_id == TRACKING_ID else None

    async def _owner_plan(_domain_id):
        return Plan("owner", "pro", PLAN_FEATURES["pro"], 100_000, 10)

    async def _no(*_args):
        return False

    monkeypatch.setattr(domain_service, "get_by_tracking_id", _get_by_tracking_id)
    monkeypatch.setattr(plan_service, "owner_plan", _owner_plan)
    monkeypatch.setattr(plan_service, "over_event_limit", _no)
    monkeypatch.setattr(plan_service, "site_paused", _no)
    return record


@pytest.fixture
def client():
    app.dependency_overrides[tracking_gate] = lambda: None
    app.dependency_overrides[blocklist_gate] = lambda: None
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _screen_view(**overrides):
    body = {
        "type": "pageview",
        "url": "app://com.acme.shop/Checkout",
        "visitorId": "visitor-1",
        "sessionId": "session-1",
        "eventId": str(uuid.uuid4()),
        "os": "iOS",
        "osVersion": "18.1",
        "appVersion": "2.3.0",
        "deviceModel": "iPhone15,2",
        "screenWidth": 393,
        "screenHeight": 852,
    }
    body.update(overrides)
    return body


def test_a_batch_of_screen_views_is_stored_with_device_and_geo(client, app_site, writes):
    response = client.post(
        f"/api/collect/{TRACKING_ID}/batch", json={"events": [_screen_view()]}
    )

    assert response.status_code == 202
    assert response.json() == {"success": True, "processed": 1}
    assert writes["events"][0]["url"] == "app://com.acme.shop/Checkout"
    session = writes["sessions"][0]
    assert (session["os"], session["osVersion"]) == ("iOS", "18.1")
    assert (session["appVersion"], session["deviceModel"]) == ("2.3.0", "iPhone15,2")
    # No referrer from an app: direct, and the batch route now looks up geo.
    assert session["sourceType"] == "direct"
    assert session["country"] == "NG"


def test_device_fields_are_cut_to_their_column_width(client, app_site, writes):
    client.post(f"/api/collect/{TRACKING_ID}", json=_screen_view(deviceModel="x" * 300))

    assert writes["sessions"][0]["deviceModel"] == "x" * 100


def test_a_device_field_that_is_not_text_is_refused(client, app_site, writes):
    response = client.post(f"/api/collect/{TRACKING_ID}", json=_screen_view(appVersion=230))

    assert response.status_code == 400
    assert writes["events"] == []


def test_a_website_event_has_no_device_fields(client, app_site, writes):
    app_site["platform"] = "web"
    client.post(
        f"/api/collect/{TRACKING_ID}",
        json={
            "type": "pageview",
            "url": "https://acme.com/",
            "visitorId": "v",
            "sessionId": "s",
        },
    )

    session = writes["sessions"][0]
    assert [session[k] for k in ("os", "osVersion", "appVersion", "deviceModel")] == [None] * 4


def test_an_app_never_records_even_when_switched_on(client, app_site, writes):
    config = client.get(f"/api/collect/{TRACKING_ID}/config")
    start = client.post(
        f"/api/collect/{TRACKING_ID}/recording/start",
        json={"sessionId": "session-1", "url": "app://com.acme.shop/Home"},
    )

    assert config.json()["trackRecordings"] is False
    assert start.status_code == 403


def test_the_app_install_snippet_names_the_bundle_id():
    from app.routers.domains import _app_install

    install = _app_install(
        {"tracking_id": "TF-1A2B3C4D", "domain": "com.acme.shop"}, "https://api.example.com"
    )

    assert install["install"] == "npm install @thravic/react-native"
    assert "Thravic.init('TF-1A2B3C4D'" in install["script"]
    # Screen URLs are app://<bundleId>/..., so the snippet sets it.
    assert "bundleId: 'com.acme.shop'" in install["script"]
    assert "apiUrl: 'https://api.example.com'" in install["script"]


def test_is_app_reads_the_platform():
    assert domain_service.is_app({"platform": "ios"})
    assert not domain_service.is_app({"platform": "web"})
    # Cached before the column existed
    assert not domain_service.is_app({"domain": "acme.com"})
    assert not domain_service.is_app(None)
