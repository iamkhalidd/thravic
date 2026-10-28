"""Public, read-only client links: `/api/share/{token}` (no account needed).

Everything here reads through the site of the link the token resolves to
(`agency_service.resolve_link`); no route takes a site id, so a link can never
reach another site, the site's settings, or anything that writes. Recordings are
only listed and played when the agency turned them on for that link. A revoked
or expired link, or one whose agency is no longer on a plan with client links,
answers 404 like a token that never existed.

`/brand-logo/{key}` serves an agency's logo (for share pages and report emails);
the key is random and changes with every upload.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Request
from starlette.responses import Response

from ..config import get_settings
from ..errors import SimpleError
from ..json_response import jsjson
from ..logging import create_logger
from ..services import (
    agency_service,
    client_report_service,
    event_service,
    recording_service,
    session_service,
)
from .recordings import recording_payload

log = create_logger("Share")

router = APIRouter()

NOT_FOUND = "This link doesn't work. It may have been switched off or expired."
PERIODS = (7, 30, 90)
TOP = 8
RECORDINGS_PAGE = 20


def _logo_base(request: Request) -> str:
    return (get_settings().api_public_url or str(request.base_url)).rstrip("/")


async def _link(token: str) -> dict[str, Any]:
    link = await agency_service.resolve_link(token, datetime.now(UTC))
    if link is None:
        raise SimpleError(NOT_FOUND, 404)
    return link


def _private(content: Any) -> Response:
    """No caching anywhere between the server and the viewer's browser."""
    return jsjson(content, headers={"Cache-Control": "private, no-store"})


@router.get("/brand-logo/{key}")
async def brand_logo(key: str):
    logo = await agency_service.logo_by_key(key)
    if logo is None:
        raise SimpleError("Not found", 404)
    return Response(
        content=logo,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.get("/{token}")
async def shared_dashboard(token: str, request: Request):
    link = await _link(token)
    domain_id = str(link["domain_id"])
    try:
        days = int(request.query_params.get("days") or 30)
    except ValueError:
        days = 30
    if days not in PERIODS:
        days = 30
    end = datetime.now(UTC)
    start = end - timedelta(days=days)
    before = start - timedelta(days=days)

    brand = await agency_service.get_brand(link["owner_id"])
    visitors = await event_service.count_unique_visitors(domain_id, start, end)
    visitors_before = await event_service.count_unique_visitors(domain_id, before, start)
    pageviews = await event_service.count_by_domain(domain_id, start, end, "pageview")
    sessions = await session_service.count_by_domain(domain_id, start, end)
    report = await agency_service.latest_report(domain_id)

    return _private({
        "site": {"name": link["site_name"] or link["domain"], "domain": link["domain"]},
        "brand": agency_service.public_brand(brand, _logo_base(request)),
        "label": link["label"],
        "permissions": {"recordings": bool(link["allow_recordings"])},
        "expiresAt": link["expires_at"],
        "days": days,
        "overview": {
            "visitors": visitors,
            "visitorsBefore": visitors_before,
            "pageviews": pageviews,
            "sessions": sessions,
            "bounceRate": await session_service.get_bounce_rate(domain_id, start, end),
            "avgDuration": await session_service.get_avg_duration(domain_id, start, end),
        },
        "series": await event_service.get_timeseries(domain_id, start, end, "day"),
        "channels": await session_service.get_source_type_breakdown(domain_id, start, end),
        "referrers": await session_service.get_top_referrers(
            domain_id, start, end, TOP, link["domain"]
        ),
        "pages": await event_service.get_top_pages(domain_id, start, end, TOP),
        "latestReport": (
            {
                "month": report["period_key"],
                "monthLabel": (report["data"] or {}).get("periodLabel"),
                "sentAt": report["sent_at"],
                "summary": (report["data"] or {}).get("summary") or [],
            }
            if report
            else None
        ),
    })


@router.get("/{token}/report.pdf")
async def shared_report_pdf(token: str):
    """The latest sent report as a PDF; last month's, built now, if none was sent."""
    link = await _link(token)
    domain = {"id": link["domain_id"], "domain": link["domain"], "name": link["site_name"],
              "user_id": link["owner_id"]}
    report = await agency_service.latest_report(str(link["domain_id"]))
    if report and report["data"]:
        data = report["data"]
    else:
        key = client_report_service.previous_month(datetime.now(UTC))
        data = await client_report_service.build(domain, key, with_insights=False)
    brand = await agency_service.get_brand(link["owner_id"])
    return Response(
        content=client_report_service.render_pdf(data, brand),
        media_type="application/pdf",
        headers={
            "Content-Disposition":
                f'inline; filename="{client_report_service.pdf_filename(data)}"',
            "Cache-Control": "private, no-store",
        },
    )


def _recordings_link(link: dict[str, Any]) -> str:
    if not link["allow_recordings"]:
        raise SimpleError("Recordings aren't shared on this link", 403)
    return str(link["domain_id"])


@router.get("/{token}/recordings")
async def shared_recordings(token: str, request: Request):
    domain_id = _recordings_link(await _link(token))
    try:
        page = max(1, int(request.query_params.get("page") or 1))
    except ValueError:
        page = 1
    rows = await recording_service.list_by_domain(
        domain_id, RECORDINGS_PAGE, (page - 1) * RECORDINGS_PAGE
    )
    total = await recording_service.count_by_domain(domain_id)
    return _private({
        "recordings": [
            {
                "id": str(r["id"]),
                "url": r.get("url"),
                "duration": r.get("duration"),
                "startedAt": r.get("started_at"),
                "device": r.get("device"),
            }
            for r in rows
        ],
        "page": page,
        "total": total,
        "pageSize": RECORDINGS_PAGE,
    })


@router.get("/{token}/recordings/{recordingId}")
async def shared_recording(token: str, recordingId: str):
    domain_id = _recordings_link(await _link(token))
    try:
        uuid.UUID(recordingId)
    except ValueError:
        raise SimpleError("Recording not found", 404) from None
    recording = await recording_service.get_by_id_light(recordingId)
    if not recording or str(recording["domain_id"]) != domain_id:
        raise SimpleError("Recording not found", 404)
    response = await recording_payload(recording)
    response.headers["Cache-Control"] = "private, no-store"
    return response
