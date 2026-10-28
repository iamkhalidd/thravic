"""Agency toolkit routes (Agency plan): branding, client reports, share links, overview.

- `/branding` is the signed-in user's own brand (name, colour, logo, "powered by").
- `/reports/{domainId}` is a site's monthly client report: who gets it, a PDF
  download and "send now".
- `/links/{domainId}` are the site's read-only client links. The token is in the
  response to the create call only; the database keeps its SHA-256.
- `/overview` lists every site the user owns or administers, busiest problems first.

A site can be managed by its owner or a domain admin; the plan checked is the
site owner's (see `require_feature`), and the brand used is the owner's too.
"""

from __future__ import annotations

import base64
import binascii
import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Request
from starlette.responses import Response

from ..config import get_settings
from ..db import query, query_one
from ..errors import SimpleError
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.auth import AuthUser, require_auth
from ..middleware.feature_gate import require_feature
from ..services import agency_service, client_report_service
from ..services.agency_service import LINK_FEATURE, OVERVIEW_FEATURE, REPORT_FEATURE
from ..services.insight_facts import pct_change

log = create_logger("Agency")

router = APIRouter()

ACCESS_DENIED = "Access denied"
NOT_FOUND = "Site not found"
MANUAL_SENDS_PER_DAY = 5
OVERVIEW_DAYS = (7, 30)
DROP_PCT = -20  # a fall this big (or bigger) in visitors or conversions needs a look
MONTH_PATTERN = re.compile(r"^\d{4}-\d{2}$")


async def _body(request: Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}


def _logo_base(request: Request) -> str:
    return (get_settings().api_public_url or str(request.base_url)).rstrip("/")


async def managed_domain(domain_id: str, user_id: str) -> dict[str, Any]:
    """The site, if the user owns it or is one of its admins; 403/404 otherwise."""
    try:
        uuid.UUID(domain_id)
    except ValueError:
        raise SimpleError(NOT_FOUND, 404) from None
    domain = await query_one(
        """
        SELECT d.* FROM domains d
        WHERE d.id = $1 AND (
            d.user_id = $2 OR EXISTS (
                SELECT 1 FROM domain_members m
                WHERE m.domain_id = d.id AND m.user_id = $2 AND m.role = 'admin'
            )
        )
        """,
        domain_id,
        user_id,
    )
    if domain is None:
        raise SimpleError(ACCESS_DENIED, 403)
    return domain


# ── Branding ─────────────────────────────────────────────────────────────────


@router.get("/branding")
async def get_branding(
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature(REPORT_FEATURE)),
):
    brand = await agency_service.get_brand(user.user_id)
    return jsjson(agency_service.public_brand(brand, _logo_base(request)))


@router.put("/branding")
async def put_branding(
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature(REPORT_FEATURE)),
):
    body = await _body(request)
    error = agency_service.brand_error(body)
    if error:
        raise SimpleError(error, 400)
    brand = await agency_service.save_brand(user.user_id, body)
    return jsjson(agency_service.public_brand(brand, _logo_base(request)))


@router.post("/branding/logo")
async def upload_logo(
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature(REPORT_FEATURE)),
):
    """`{"image": "data:image/png;base64,…"}` (or bare base64); stored as a PNG."""
    image = (await _body(request)).get("image")
    if not isinstance(image, str) or not image:
        raise SimpleError("image is required", 400)
    encoded = image.split(",", 1)[1] if image.startswith("data:") else image
    if len(encoded) > agency_service.MAX_LOGO_BYTES * 4 // 3 + 8:
        raise SimpleError(
            f"The logo must be an image under {agency_service.MAX_LOGO_BYTES // 1024} KB", 400
        )
    try:
        raw = base64.b64decode(encoded, validate=True)
        png = agency_service.normalise_logo(raw)
    except (binascii.Error, ValueError) as exc:
        message = str(exc) if isinstance(exc, ValueError) and str(exc) else ""
        raise SimpleError(message or "That file isn't an image we can read", 400) from None
    brand = await agency_service.save_logo(user.user_id, png)
    return jsjson(agency_service.public_brand(brand, _logo_base(request)))


@router.delete("/branding/logo")
async def delete_logo(
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature(REPORT_FEATURE)),
):
    brand = await agency_service.remove_logo(user.user_id)
    return jsjson(agency_service.public_brand(brand, _logo_base(request)))


# ── Client reports ───────────────────────────────────────────────────────────


def _month(value: str | None, now: datetime) -> str:
    """The `?month=` asked for (a finished or current month), or last month."""
    if not value:
        return client_report_service.previous_month(now)
    if not MONTH_PATTERN.match(value):
        raise SimpleError("month must look like 2026-09", 400)
    try:
        start, _ = client_report_service.month_bounds(value)
    except ValueError:
        raise SimpleError("month must look like 2026-09", 400) from None
    if start > now:
        raise SimpleError("That month hasn't started yet", 400)
    return value


def _report_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "month": row["period_key"],
        "trigger": row["trigger"],
        "recipients": row["recipients"],
        "sentAt": row["sent_at"],
    }


@router.get("/reports/{domainId}")
async def get_report_settings(
    domainId: str,
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature(REPORT_FEATURE)),
):
    domain = await managed_domain(domainId, user.user_id)
    settings = await agency_service.get_report_settings(domainId)
    brand = await agency_service.get_brand(domain["user_id"])
    return jsjson({
        **settings,
        "defaultMonth": client_report_service.previous_month(datetime.now(UTC)),
        "brand": agency_service.public_brand(brand, _logo_base(request)),
        "isBrandOwner": str(domain["user_id"]) == str(user.user_id),
        "history": [_report_row(r) for r in await agency_service.recent_reports(domainId)],
    })


@router.put("/reports/{domainId}")
async def put_report_settings(
    domainId: str,
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature(REPORT_FEATURE)),
):
    await managed_domain(domainId, user.user_id)
    body = await _body(request)
    enabled = body.get("enabled", False)
    if not isinstance(enabled, bool):
        raise SimpleError("enabled must be true or false", 400)
    recipients, error = agency_service.clean_recipients(body.get("recipients", []))
    if error:
        raise SimpleError(error, 400)
    if enabled and not recipients:
        raise SimpleError("Add at least one email address to send the report to", 400)
    await agency_service.save_report_settings(domainId, enabled, recipients)
    return jsjson(await agency_service.get_report_settings(domainId))


@router.get("/reports/{domainId}/pdf")
async def download_report(
    domainId: str,
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature(REPORT_FEATURE)),
):
    domain = await managed_domain(domainId, user.user_id)
    key = _month(request.query_params.get("month"), datetime.now(UTC))
    data = await client_report_service.build(domain, key)
    brand = await agency_service.get_brand(domain["user_id"])
    pdf = client_report_service.render_pdf(data, brand)
    filename = client_report_service.pdf_filename(data)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.post("/reports/{domainId}/send")
async def send_report(
    domainId: str,
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature(REPORT_FEATURE)),
):
    """Send now: to `recipients` if given, else the saved list."""
    domain = await managed_domain(domainId, user.user_id)
    body = await _body(request)
    key = _month(body.get("month") if isinstance(body.get("month"), str) else None,
                 datetime.now(UTC))
    if "recipients" in body:
        recipients, error = agency_service.clean_recipients(body["recipients"])
        if error:
            raise SimpleError(error, 400)
    else:
        recipients = (await agency_service.get_report_settings(domainId))["recipients"]
    if not recipients:
        raise SimpleError("Add at least one email address to send the report to", 400)

    recent = await query_one(
        "SELECT COUNT(*)::int AS n FROM client_reports WHERE domain_id = $1 "
        "AND trigger = 'manual' AND sent_at > NOW() - INTERVAL '1 day'",
        domainId,
    )
    if int((recent or {}).get("n") or 0) >= MANUAL_SENDS_PER_DAY:
        raise SimpleError(
            f"You can send this site's report {MANUAL_SENDS_PER_DAY} times a day. "
            "Try again tomorrow.",
            429,
        )

    data = await client_report_service.build(domain, key)
    try:
        sent = await client_report_service.deliver(
            domain, data, recipients, "manual", _logo_base(request)
        )
    except Exception as exc:  # noqa: BLE001 — tell the agency, keep the details in the log
        log.error(f"Send-now client report for {domain['domain']} failed: {exc}")
        raise SimpleError("The report could not be sent. Please try again shortly.", 502) from None
    return jsjson({"sent": sent, "month": key})


# ── Share links ──────────────────────────────────────────────────────────────


@router.get("/links/{domainId}")
async def list_links(
    domainId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature(LINK_FEATURE)),
):
    await managed_domain(domainId, user.user_id)
    now = datetime.now(UTC)
    return jsjson([agency_service.public_link(r, now)
                   for r in await agency_service.list_links(domainId)])


@router.post("/links/{domainId}")
async def create_link(
    domainId: str,
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature(LINK_FEATURE)),
):
    await managed_domain(domainId, user.user_id)
    body = await _body(request)
    label = body.get("label", "")
    if not isinstance(label, str) or len(label.strip()) > 80:
        raise SimpleError("label must be text of at most 80 characters", 400)
    allow = body.get("allowRecordings", False)
    if not isinstance(allow, bool):
        raise SimpleError("allowRecordings must be true or false", 400)
    expires = body.get("expiresInDays")
    error = agency_service.expiry_error(expires)
    if error:
        raise SimpleError(error, 400)
    if await agency_service.active_link_count(domainId) >= agency_service.MAX_LINKS_PER_SITE:
        raise SimpleError(
            f"A site can have up to {agency_service.MAX_LINKS_PER_SITE} working links. "
            "Revoke one first.",
            400,
        )
    now = datetime.now(UTC)
    token, row = await agency_service.create_link(
        domainId, user.user_id, label.strip(), allow, expires, now
    )
    return jsjson({**agency_service.public_link(row, now), "token": token}, status_code=201)


@router.delete("/links/{domainId}/{linkId}")
async def revoke_link(
    domainId: str,
    linkId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature(LINK_FEATURE)),
):
    await managed_domain(domainId, user.user_id)
    try:
        uuid.UUID(linkId)
    except ValueError:
        raise SimpleError("Link not found", 404) from None
    if not await agency_service.revoke_link(domainId, linkId):
        raise SimpleError("Link not found", 404)
    return jsjson({"revoked": True})


# ── All-clients overview ─────────────────────────────────────────────────────

SITES_QUERY = """
SELECT d.id, d.domain, d.name, d.user_id, (d.user_id = $1) AS owned
FROM domains d
WHERE d.user_id = $1 OR EXISTS (
    SELECT 1 FROM domain_members m
    WHERE m.domain_id = d.id AND m.user_id = $1 AND m.role = 'admin'
)
ORDER BY d.domain
"""

VISITORS_QUERY = """
SELECT domain_id,
       COUNT(DISTINCT visitor_id) FILTER (WHERE started_at >= $3)::int AS visitors,
       COUNT(DISTINCT visitor_id) FILTER (WHERE started_at < $3)::int AS visitors_before,
       MAX(started_at) AS last_visit
FROM sessions
WHERE domain_id = ANY($1::uuid[]) AND started_at >= $2 AND started_at < $4
GROUP BY domain_id
"""

CONVERSIONS_QUERY = """
SELECT domain_id,
       COUNT(*) FILTER (WHERE created_at >= $3)::int AS conversions,
       COUNT(*) FILTER (WHERE created_at < $3)::int AS conversions_before
FROM events
WHERE domain_id = ANY($1::uuid[]) AND type = 'custom'
  AND created_at >= $2 AND created_at < $4
  AND COALESCE(data->>'event', '') <> ''
  AND NOT (data->>'event' = ANY($5::text[]))
GROUP BY domain_id
"""

ALERTS_QUERY = """
SELECT DISTINCT ON (domain_id) domain_id, title AS latest_alert,
       COUNT(*) OVER (PARTITION BY domain_id)::int AS open_alerts
FROM alerts
WHERE domain_id = ANY($1::uuid[]) AND created_at >= $2
ORDER BY domain_id, created_at DESC
"""

REPORTS_QUERY = """
SELECT DISTINCT ON (domain_id) domain_id, sent_at AS last_report_at,
       period_key AS last_report_month
FROM client_reports
WHERE domain_id = ANY($1::uuid[])
ORDER BY domain_id, sent_at DESC
"""

SETTINGS_QUERY = """
SELECT domain_id, enabled FROM client_report_settings WHERE domain_id = ANY($1::uuid[])
"""


def attention_reasons(site: dict[str, Any]) -> list[str]:
    """Why a site needs a look this period, most serious first; [] when it's fine."""
    reasons: list[str] = []
    if site["visitors"] == 0 and site["visitorsBefore"] > 0:
        reasons.append("No visits this period - check the tracking code")
    elif site["visitors"] == 0 and site["lastVisitAt"] is None:
        reasons.append("No visits yet")
    if site["openAlerts"]:
        n = site["openAlerts"]
        reasons.append(f"{n} alert{'' if n == 1 else 's'} in the last 7 days")
    change = site["visitorsChangePct"]
    if change is not None and change <= DROP_PCT and site["visitors"] > 0:
        reasons.append(f"Visitors down {abs(change)}%")
    conv = site["conversionsChangePct"]
    if conv is not None and conv <= DROP_PCT:
        reasons.append(f"Conversions down {abs(conv)}%")
    return reasons


def sort_key(site: dict[str, Any]) -> tuple:
    """Sites needing attention first (most reasons first), then the busiest."""
    return (0 if site["attention"] else 1, -len(site["attention"]), -site["visitors"],
            site["domain"])


def overview_rows(
    sites: list[dict[str, Any]],
    visitors: list[dict[str, Any]],
    conversions: list[dict[str, Any]],
    alerts: list[dict[str, Any]],
    reports: list[dict[str, Any]],
    settings: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """One row per site, joined from the bulk queries and sorted attention-first."""
    def by_domain(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        return {str(r["domain_id"]): r for r in rows}

    v, c, a, r, s = (by_domain(x) for x in (visitors, conversions, alerts, reports, settings))
    out = []
    for site in sites:
        key = str(site["id"])
        vis, conv = v.get(key, {}), c.get(key, {})
        row = {
            "id": key,
            "domain": site["domain"],
            "name": site.get("name") or site["domain"],
            "owned": bool(site["owned"]),
            "visitors": int(vis.get("visitors") or 0),
            "visitorsBefore": int(vis.get("visitors_before") or 0),
            "lastVisitAt": vis.get("last_visit"),
            "conversions": int(conv.get("conversions") or 0),
            "conversionsBefore": int(conv.get("conversions_before") or 0),
            "openAlerts": int(a.get(key, {}).get("open_alerts") or 0),
            "latestAlert": a.get(key, {}).get("latest_alert"),
            "lastReportAt": r.get(key, {}).get("last_report_at"),
            "lastReportMonth": r.get(key, {}).get("last_report_month"),
            "reportsOn": bool(s.get(key, {}).get("enabled")),
        }
        row["visitorsChangePct"] = pct_change(row["visitors"], row["visitorsBefore"])
        row["conversionsChangePct"] = pct_change(row["conversions"], row["conversionsBefore"])
        row["attention"] = attention_reasons(row)
        out.append(row)
    return sorted(out, key=sort_key)


@router.get("/overview")
async def overview(
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature(OVERVIEW_FEATURE)),
):
    try:
        days = int(request.query_params.get("days") or 30)
    except ValueError:
        days = 30
    if days not in OVERVIEW_DAYS:
        days = 30
    now = datetime.now(UTC)
    start = now - timedelta(days=days)
    before = start - timedelta(days=days)

    sites = await query(SITES_QUERY, user.user_id)
    ids = [s["id"] for s in sites]
    if not ids:
        return jsjson({"days": days, "sites": []})
    rows = overview_rows(
        sites,
        await query(VISITORS_QUERY, ids, before, start, now),
        await query(CONVERSIONS_QUERY, ids, before, start, now,
                    list(client_report_service.SYSTEM_EVENTS)),
        await query(ALERTS_QUERY, ids, now - timedelta(days=7)),
        await query(REPORTS_QUERY, ids),
        await query(SETTINGS_QUERY, ids),
    )
    return jsjson({"days": days, "sites": rows})
