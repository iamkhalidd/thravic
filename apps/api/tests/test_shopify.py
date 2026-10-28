"""The Shopify app (integrations/shopify): what its web pixel sends is collected
and stored in one shape, its admin page can be framed by Shopify, and its
privacy webhooks check Shopify's signature."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import uuid

import pytest

from app.config import get_settings
from app.routers import custom_events
from app.routers.collect import clean_commerce
from app.routers.shopify import app_page_csp, valid_hmac
from tests.test_collect import TRACKING_ID, client, domain, writes  # noqa: F401 - fixtures

SECRET = "shpss_test_secret"


def _pixel_event(**data):
    """The payload integrations/shopify/extensions/thravic-pixel/src/events.js builds."""
    return {
        "eventId": "shopify-sh-123",
        "type": "custom",
        "url": "https://shop.example/checkouts/cn/abc/thank-you",
        "referrer": "https://shop.example/cart",
        "visitorId": str(uuid.uuid4()),
        "sessionId": str(uuid.uuid4()),
        "utmSource": None,
        "screenWidth": 390,
        "screenHeight": 844,
        "language": "en-NG",
        "data": {"event": "purchase", **data},
    }


# ── Collecting the pixel's events ────────────────────────────────────────────


def test_a_pixel_purchase_is_stored(client, domain, writes):  # noqa: F811
    body = _pixel_event(value=15000.5, currency="ngn", items=3, orderId="5551234")
    response = client.post(
        f"/api/collect/{TRACKING_ID}",
        content=json.dumps(body),
        # The pixel posts text/plain to skip the CORS preflight.
        headers={"Content-Type": "text/plain;charset=UTF-8", "Origin": "https://shop.example"},
    )

    assert response.status_code == 202
    assert response.headers["access-control-allow-origin"] == "*"
    event = writes.events[0][0]
    assert event["eventId"] == "shopify-sh-123"
    assert event["type"] == "custom"
    assert event["data"] == {
        "event": "purchase", "value": 15000.5, "currency": "NGN", "items": 3, "orderId": "5551234",
    }
    assert writes.sessions[0]["visitorId"] == body["visitorId"]


def test_the_collector_preflight_allows_the_pixel_sandbox(client):  # noqa: F811
    response = client.options(
        f"/api/collect/{TRACKING_ID}",
        headers={
            "Origin": "null",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 204
    assert response.headers["access-control-allow-origin"] == "*"


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        ({"event": "add_to_cart", "value": "30.00", "currency": "USD", "items": 2.0},
         {"event": "add_to_cart", "value": 30.0, "currency": "USD", "items": 2}),
        ({"event": "purchase", "value": -5, "currency": "NAIRA", "orderId": True},
         {"event": "purchase"}),
        ({"event": "purchase", "value": float("nan"), "items": "lots", "orderId": 77},
         {"event": "purchase", "orderId": "77"}),
        ({"event": "checkout_started", "value": True, "currency": " ghs ", "product": "Tote"},
         {"event": "checkout_started", "currency": "GHS", "product": "Tote"}),
    ],
)
def test_commerce_fields_are_kept_only_in_a_summable_shape(data, expected):
    assert clean_commerce(data) == expected


def test_a_long_order_id_is_cut(client, domain, writes):  # noqa: F811
    client.post(f"/api/collect/{TRACKING_ID}", json=_pixel_event(orderId="x" * 300))
    assert len(writes.events[0][0]["data"]["orderId"]) == 100


# ── Revenue for the dashboard ────────────────────────────────────────────────


def test_revenue_counts_each_order_once_per_currency():
    sql = custom_events.REVENUE_SQL
    assert "DISTINCT ON (COALESCE(data->>'orderId', id::text))" in sql
    assert "GROUP BY currency" in sql
    # Only clean amounts, so the numeric cast can never fail a request.
    assert "jsonb_typeof(data->'value') = 'number'" in sql


def test_revenue_returns_one_line_per_currency(client, monkeypatch):  # noqa: F811
    from app.main import app
    from app.middleware.auth import AuthUser, require_auth

    owner = str(uuid.uuid4())
    domain_id = str(uuid.uuid4())

    async def _get_by_id(_domain_id):
        return {"id": domain_id, "user_id": owner}

    async def _query(_sql, *_args):
        return [
            {"currency": "NGN", "purchases": 4, "total": 52000.0},
            {"currency": "USD", "purchases": 1, "total": 30.0},
        ]

    monkeypatch.setattr(custom_events.domain_service, "get_by_id", _get_by_id)
    monkeypatch.setattr(custom_events, "query", _query)
    app.dependency_overrides[require_auth] = lambda: AuthUser(user_id=owner, email="o@x.invalid")

    response = client.get(f"/api/custom-events/{domain_id}/revenue")

    assert response.status_code == 200
    assert response.json() == {"currencies": [
        {"currency": "NGN", "purchases": 4, "total": 52000.0},
        {"currency": "USD", "purchases": 1, "total": 30.0},
    ]}


# ── The app's admin page ─────────────────────────────────────────────────────


def test_the_app_page_can_be_framed_by_the_shop_and_admin(client, monkeypatch):  # noqa: F811
    monkeypatch.setattr(get_settings(), "SHOPIFY_CLIENT_ID", "abc123")

    response = client.get("/shopify/app?shop=my-store.myshopify.com&host=xyz")

    assert response.status_code == 200
    assert '<meta name="shopify-api-key" content="abc123">' in response.text
    assert "x-frame-options" not in response.headers
    csp = response.headers["content-security-policy"]
    assert "frame-ancestors https://my-store.myshopify.com https://admin.shopify.com" in csp
    assert "https://cdn.shopify.com" in csp


def test_an_odd_shop_value_is_not_put_into_the_policy():
    csp = app_page_csp("evil.com; script-src *")
    assert "evil.com" not in csp
    assert "frame-ancestors https://*.myshopify.com https://admin.shopify.com" in csp


def test_the_app_page_says_so_when_not_set_up(client, monkeypatch):  # noqa: F811
    monkeypatch.setattr(get_settings(), "SHOPIFY_CLIENT_ID", None)
    response = client.get("/shopify/app")
    assert response.status_code == 503
    assert response.headers["x-frame-options"] == "SAMEORIGIN"


def test_the_app_page_assets_are_served(client):  # noqa: F811
    script = client.get("/shopify/app.js")
    assert script.status_code == 200
    assert "webPixelCreate" in script.text
    assert client.get("/shopify/app.css").status_code == 200


def test_other_pages_still_refuse_framing(client):  # noqa: F811
    response = client.get("/health")
    assert response.headers.get("x-frame-options") == "SAMEORIGIN"


# ── Privacy (GDPR) webhooks ──────────────────────────────────────────────────


def _sign(body: bytes, secret: str = SECRET) -> str:
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()


@pytest.mark.parametrize("topic", ["customers/data_request", "customers/redact", "shop/redact"])
def test_a_signed_compliance_webhook_is_confirmed(client, monkeypatch, topic):  # noqa: F811
    monkeypatch.setattr(get_settings(), "SHOPIFY_CLIENT_SECRET", SECRET)
    body = json.dumps({"shop_id": 1, "shop_domain": "my-store.myshopify.com"}).encode()

    response = client.post(
        "/api/shopify/webhooks",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Shopify-Hmac-Sha256": _sign(body),
            "X-Shopify-Topic": topic,
            "X-Shopify-Shop-Domain": "my-store.myshopify.com",
        },
    )
    assert response.status_code == 200


def test_a_badly_signed_webhook_is_a_401(client, monkeypatch):  # noqa: F811
    monkeypatch.setattr(get_settings(), "SHOPIFY_CLIENT_SECRET", SECRET)
    body = b'{"shop_id": 1}'
    for signature in (_sign(body, "wrong"), "", None):
        headers = {"X-Shopify-Topic": "shop/redact"}
        if signature is not None:
            headers["X-Shopify-Hmac-Sha256"] = signature
        response = client.post("/api/shopify/webhooks", content=body, headers=headers)
        assert response.status_code == 401


def test_without_a_secret_nothing_is_trusted():
    body = b"{}"
    assert valid_hmac(body, _sign(body), None) is False
    assert valid_hmac(body, _sign(body), SECRET) is True
