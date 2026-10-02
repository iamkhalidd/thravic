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
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter
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
CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=3600"


def _api_url() -> str:
    """`process.env.SERVER_URL || process.env.API_URL || ''`."""
    settings = get_settings()
    return settings.SERVER_URL or settings.API_URL or ""


def _render() -> bytes:
    return TRACKER_TEMPLATE.replace(b"${apiUrl}", _api_url().encode("utf-8"))


def _script_response() -> Response:
    """`res.send(template)` with the three headers the route sets explicitly.

    `media_type` is left unset because Starlette only appends `; charset=utf-8` to
    `text/*`, whereas Express sets the full value by hand here.
    """
    return Response(
        content=_render(),
        headers={
            "content-type": CONTENT_TYPE,
            "cache-control": CACHE_CONTROL,
            "access-control-allow-origin": "*",
        },
    )


@router.get("/tf.js")
@router.get("/v.js")
async def tracker_script():
    try:
        return _script_response()
    except Exception as exc:  # noqa: BLE001
        log.error(f"Tracker script error: {exc}")
        return Response(status_code=500)
