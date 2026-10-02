"""CSV export route — port of `routes/export.ts`.

Returns a CSV download rather than JSON, so the parity harness compares raw bytes.
An unrecognised `type` writes only the header block (Express falls through both
branches and calls `res.end()`), and only `sessions` escapes quotes in `user_agent`
— `events` escapes `url` and `referrer` but leaves nothing else quoted.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from starlette.responses import Response

from ..db import query
from ..errors import SimpleError
from ..js_compat import js_date_to_string
from ..logging import create_logger
from ..middleware.auth import AuthUser, require_auth
from ..middleware.feature_gate import require_feature

log = create_logger("Export")

router = APIRouter()

ROW_LIMIT = 10_000

FAILED_EXPORT = "Failed to export data"


class _CsvResponse(Response):
    """A `text/csv` response with no charset suffix.

    Starlette appends `; charset=utf-8` to every `text/*` media type, but Express
    sets the header itself and then writes the body by hand, so the response that
    ships is exactly `text/csv`. Re-applying the value after `init_headers` keeps
    the two identical.
    """

    def init_headers(self, headers=None) -> None:  # type: ignore[override]
        super().init_headers(headers)
        if self.headers.get("content-type"):
            self.headers["content-type"] = "text/csv"


def _js_str(value: Any) -> str:
    """`String(value)` for the value types these rows contain."""
    if isinstance(value, datetime):
        return js_date_to_string(value)
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _js_or_empty(value: Any) -> str:
    """`value || ''` — JS falsiness, so `0`, `false` and `None` all become empty."""
    if value is None or value is False or value == "" or value == 0:
        return ""
    return _js_str(value)


def _quote_csv(value: Any) -> str:
    """`"${String(value).replace(/"/g, '""')}"` — the wrapping quotes are added by
    the template literal in the source, and a null/undefined value stringifies."""
    if value is None:
        return '""'
    text = _js_str(value)
    return '"' + text.replace('"', '""') + '"'


@router.get("/{domainId}")
async def export_domain(
    domainId: str,
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("export")),
):
    try:
        export_type = request.query_params.get("type") or "sessions"

        # Ownership is checked here rather than via the shared helper, and the 403
        # message is route-specific.
        owned = await query(
            "SELECT id FROM domains WHERE id = $1 AND user_id = $2", domainId, user.user_id
        )
        if not owned:
            raise SimpleError("Access denied to this domain", 403)

        lines: list[str] = []

        if export_type == "sessions":
            sessions = await query(
                """
                SELECT session_id, visitor_id, started_at, ended_at, source, source_type,
                       utm_source, user_agent, screen_width, language
                FROM sessions
                WHERE domain_id = $1
                ORDER BY started_at DESC
                LIMIT 10000
                """,
                domainId,
            )

            lines.append(
                "Session ID,Visitor ID,Started At,Ended At,Source,Source Type,"
                "UTM Source,User Agent,Screen Width,Language\n"
            )

            for s in sessions:
                lines.append(
                    ",".join(
                        [
                            _js_str(s["session_id"]),
                            _js_str(s["visitor_id"]),
                            _js_str(s["started_at"]),
                            _js_or_empty(s["ended_at"]),
                            _js_or_empty(s["source"]),
                            _js_or_empty(s["source_type"]),
                            _js_or_empty(s["utm_source"]),
                            _quote_csv(s["user_agent"]),
                            _js_or_empty(s["screen_width"]),
                            _js_or_empty(s["language"]),
                        ]
                    )
                    + "\n"
                )

        elif export_type == "events":
            events = await query(
                """
                SELECT type, url, referrer, created_at
                FROM events
                WHERE domain_id = $1
                ORDER BY created_at DESC
                LIMIT 10000
                """,
                domainId,
            )

            lines.append("Type,URL,Referrer,Created At\n")
            for e in events:
                lines.append(
                    ",".join(
                        [
                            _js_str(e["type"]),
                            _quote_csv(e["url"]),
                            _quote_csv(e["referrer"]),
                            _js_str(e["created_at"]),
                        ]
                    )
                    + "\n"
                )

        return _CsvResponse(
            content="".join(lines),
            headers={
                # Express sets the header and then writes the body manually, so no
                # charset suffix is appended — it stays exactly `text/csv`.
                "Content-Type": "text/csv",
                "Content-Disposition": (
                    f'attachment; filename="thravic-{export_type}-{domainId}.csv"'
                ),
            },
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Export error: {exc}")
        raise SimpleError(FAILED_EXPORT, 500) from None
