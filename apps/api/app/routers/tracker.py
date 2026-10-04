"""Tracking-script delivery — serves the built tracker at `/tf.js` and `/v.js`.

The source of truth is `apps/api/tracker/src/index.ts`; esbuild bundles it into
`app/static/tracker.js`, which is committed to the repo (rebuild with
`npm run build` from `apps/api/tracker` after changing the source — never
hand-edit the built file). This route reads the artifact once as bytes at
import and substitutes the single `${apiUrl}` placeholder — emitted by the
tracker's default `endpoint` string — with `SERVER_URL or API_URL or ''`, the
same variables the previous backend resolved for this route (deliberately NOT
the `public_api_url` helper used elsewhere, which also falls back to
`RENDER_EXTERNAL_URL`).

Caching: the script is served with a **short** `max-age` plus a long
`stale-while-revalidate`, and carries a strong `ETag`. A visitor therefore picks
up a new build on their next navigation after the TTL, and the browser serves the
stale copy instantly while revalidating in the background — so refreshing the
tracker never blocks a page. Revalidation is a bodiless `304`, which is why the
TTL can be short without cost.

Customers install this with a fixed URL (`<script src=".../tf.js">`), so the URL
cannot be version-busted. Header TTL is the only lever, and it cannot reach a
browser that is already holding an older copy — those expire on their own.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from fastapi import APIRouter, Request
from starlette.responses import Response

from ..config import get_settings
from ..logging import create_logger

log = create_logger("Tracker")

router = APIRouter()

# Rebuild after changing apps/api/tracker/src/index.ts: npm run build (from apps/api/tracker)
TRACKER_PATH = Path(__file__).resolve().parents[1] / "static" / "tracker.js"

# Read once — the asset never changes while the process is running.
TRACKER_TEMPLATE = TRACKER_PATH.read_bytes()

CONTENT_TYPE = "application/javascript; charset=utf-8"

# 5 minutes, then the browser revalidates in the background. Lower `max-age` to 0
# if a rebuild must reach returning visitors on their very next page load — the
# cost is a bodiless conditional request per load.
CACHE_MAX_AGE_SECONDS = 300
STALE_WHILE_REVALIDATE_SECONDS = 86_400
CACHE_CONTROL = (
    f"public, max-age={CACHE_MAX_AGE_SECONDS}, "
    f"stale-while-revalidate={STALE_WHILE_REVALIDATE_SECONDS}"
)

_etag: str | None = None


def _api_url() -> str:
    """`process.env.SERVER_URL || process.env.API_URL || ''`."""
    settings = get_settings()
    return settings.SERVER_URL or settings.API_URL or ""


def _render() -> bytes:
    return TRACKER_TEMPLATE.replace(b"${apiUrl}", _api_url().encode("utf-8"))


def _etag_for(body: bytes) -> str:
    """Strong validator derived from the served bytes.

    Cached after the first call: neither the committed artifact nor `SERVER_URL`
    changes while the process is running.
    """
    global _etag
    if _etag is None:
        _etag = '"' + hashlib.sha1(body).hexdigest()[:16] + '"'
    return _etag


def _headers(body: bytes) -> dict[str, str]:
    """The three headers the route sets explicitly, plus the validator.

    `media_type` is left unset because Starlette only appends `; charset=utf-8` to
    `text/*`, whereas Express sets the full value by hand here.
    """
    return {
        "content-type": CONTENT_TYPE,
        "cache-control": CACHE_CONTROL,
        "access-control-allow-origin": "*",
        "etag": _etag_for(body),
    }


@router.get("/tf.js")
@router.get("/v.js")
async def tracker_script(request: Request):
    try:
        body = _render()
        headers = _headers(body)

        # A revalidating browser sends the validator back; answer 304 and skip
        # re-sending ~14 KB it already has.
        if request.headers.get("if-none-match") == headers["etag"]:
            return Response(status_code=304, headers=headers)

        return Response(content=body, headers=headers)
    except Exception as exc:  # noqa: BLE001
        log.error(f"Tracker script error: {exc}")
        return Response(status_code=500)
