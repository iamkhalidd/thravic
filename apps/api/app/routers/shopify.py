"""The Thravic Shopify app's server side (the app itself is in integrations/shopify).

Two things live here:

* `/shopify/app` — the app's page inside the Shopify admin (its `application_url`).
  A static page: the merchant types their tracking ID and the page's script saves
  it to the web pixel and the theme embed through App Bridge's Direct API access,
  so this server never receives or stores a Shopify access token.
* `/api/shopify/webhooks` — the three mandatory privacy (GDPR) webhooks. Thravic
  keeps no Shopify customer data: the pixel sends order totals and random
  visitor ids, never names, emails, phone numbers or addresses. So a valid
  request is simply confirmed. https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import html
import re
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, HTMLResponse, Response

from ..config import get_settings
from ..json_response import jsjson
from ..logging import create_logger

log = create_logger("Shopify")

router = APIRouter()

STATIC_DIR = Path(__file__).resolve().parents[1] / "static" / "shopify"

COMPLIANCE_TOPICS = frozenset({"customers/data_request", "customers/redact", "shop/redact"})

# A shop's own admin domain, e.g. my-store.myshopify.com.
SHOP_DOMAIN = re.compile(r"^[a-z0-9][a-z0-9-]*\.myshopify\.com$")

# Shopify needs the page to allow framing by the admin and by the shop only.
# https://shopify.dev/docs/apps/build/security/set-up-iframe-protection
APP_BRIDGE_CDN = "https://cdn.shopify.com"


def app_page_csp(shop: str | None) -> str:
    """The app page's Content-Security-Policy. `frame-ancestors` names the shop
    from the `?shop=` Shopify adds, or every shop when it is missing or odd."""
    shop_origin = f"https://{shop}" if shop and SHOP_DOMAIN.match(shop) else "https://*.myshopify.com"
    directives = [
        ("default-src", "'self'"),
        ("script-src", f"'self' {APP_BRIDGE_CDN}"),
        ("style-src", "'self' 'unsafe-inline'"),
        ("img-src", "'self' data: https:"),
        ("connect-src", "'self' https://*.shopify.com https://*.myshopify.com"),
        ("frame-ancestors", f"{shop_origin} https://admin.shopify.com"),
        ("object-src", "'none'"),
    ]
    return "; ".join(f"{name} {value}" for name, value in directives)


@router.get("/shopify/app")
async def app_page(request: Request):
    client_id = get_settings().SHOPIFY_CLIENT_ID
    if not client_id:
        return HTMLResponse("The Thravic Shopify app is not set up on this server.", 503)
    page = (STATIC_DIR / "app.html").read_text(encoding="utf-8")
    page = page.replace("{{CLIENT_ID}}", html.escape(client_id, quote=True))
    return HTMLResponse(
        page,
        headers={
            "Content-Security-Policy": app_page_csp(request.query_params.get("shop")),
            "Cache-Control": "no-store",
        },
    )


@router.get("/shopify/app.js")
async def app_script():
    return FileResponse(STATIC_DIR / "app.js", media_type="application/javascript")


@router.get("/shopify/app.css")
async def app_styles():
    return FileResponse(STATIC_DIR / "app.css", media_type="text/css")


def valid_hmac(body: bytes, header: str | None, secret: str | None) -> bool:
    """`X-Shopify-Hmac-Sha256`: base64 HMAC-SHA256 of the raw body, keyed with the
    app's client secret. https://shopify.dev/docs/apps/build/webhooks/subscribe/https"""
    if not header or not secret:
        return False
    digest = hmac.new(secret.encode(), body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64encode(digest).decode(), header.strip())


@router.post("/api/shopify/webhooks")
async def compliance_webhook(request: Request):
    body = await request.body()
    if not valid_hmac(
        body,
        request.headers.get("x-shopify-hmac-sha256"),
        get_settings().SHOPIFY_CLIENT_SECRET,
    ):
        return jsjson({"error": "Invalid signature"}, status_code=401)

    topic = request.headers.get("x-shopify-topic") or ""
    shop = request.headers.get("x-shopify-shop-domain") or ""
    if topic in COMPLIANCE_TOPICS:
        # Nothing to export or erase: see the module docstring.
        log.info(f"Shopify {topic} for {shop}: no Shopify customer data is stored")
    else:
        log.info(f"Shopify webhook {topic or '(no topic)'} for {shop} ignored")
    return Response(status_code=200)
