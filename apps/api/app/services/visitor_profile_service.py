"""Visitor profiles: who a visitor is, and everything they did, in one timeline.

A visitor is the `visitors` row (one browser or app install on one site). If the
site calls `TF('identify', userId, traits)`, the latest identify event names
them: `userId`, plus `email` and `name` when the traits carry them.

The timeline is the visitor's events, newest first: page views, custom events,
form submits, rage clicks and errors. Clicks and scrolls are left out; there are
too many of them to read, and the recording shows them better.
"""

from __future__ import annotations

from typing import Any

from ..db import query, query_one
from .session_service import device_case_sql

DEFAULT_LIMIT = 50
MAX_LIMIT = 100
TIMELINE_LIMIT = 300
SESSIONS_LIMIT = 50
TIMELINE_TYPES = ("pageview", "custom", "form")

# The latest identify event of visitor `v.id`
_IDENTITY_SQL = """
    LEFT JOIN LATERAL (
        SELECT e.data->>'userId' AS user_id,
               COALESCE(e.data->>'email', e.data->>'$email') AS email,
               COALESCE(e.data->>'name', e.data->>'$name') AS name
        FROM events e
        WHERE e.visitor_id = v.id AND e.type = 'custom' AND e.data->>'event' = 'identify'
        ORDER BY e.created_at DESC
        LIMIT 1
    ) who ON TRUE
"""

# The visitor's latest session, for where and on what they were last seen
_LAST_SESSION_SQL = f"""
    LEFT JOIN LATERAL (
        SELECT s.country, s.city, {device_case_sql("s.screen_width")} AS device,
               s.os, s.device_model, s.source
        FROM sessions s
        WHERE s.visitor_id = v.id
        ORDER BY s.started_at DESC
        LIMIT 1
    ) last ON TRUE
"""


def _visitor(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "visitorId": row["visitor_id"],
        "userId": row["user_id"],
        "email": row["email"],
        "name": row["name"],
        "firstSeen": row["first_seen"],
        "lastSeen": row["last_seen"],
        "sessions": int(row["sessions"] or 0),
        "pageviews": int(row["pageviews"] or 0),
        "country": row["country"],
        "city": row["city"],
        "device": row["device"],
        "os": row["os"],
        "deviceModel": row["device_model"],
        "source": row["source"],
    }


_COUNTS_SQL = """
    LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS sessions, COALESCE(SUM(s.pageviews), 0)::int AS pageviews
        FROM sessions s WHERE s.visitor_id = v.id
    ) counts ON TRUE
"""


async def list_visitors(
    domain_id: Any, search: str | None = None, limit: int = DEFAULT_LIMIT
) -> list[dict[str, Any]]:
    """Most recently seen first. `search` matches the identified user id, email or
    name, or the start of the browser's visitor id."""
    params: list[Any] = [domain_id, limit]
    where = ""
    if search:
        params.append(f"%{search}%")
        params.append(f"{search}%")
        where = """
          AND (who.user_id ILIKE $3 OR who.email ILIKE $3 OR who.name ILIKE $3
               OR v.visitor_id ILIKE $4)
        """
    rows = await query(
        f"""
        SELECT v.id, v.visitor_id, v.first_seen, v.last_seen,
               who.user_id, who.email, who.name,
               counts.sessions, counts.pageviews,
               last.country, last.city, last.device, last.os, last.device_model, last.source
        FROM visitors v
        {_IDENTITY_SQL}
        {_COUNTS_SQL}
        {_LAST_SESSION_SQL}
        WHERE v.domain_id = $1 {where}
        ORDER BY v.last_seen DESC NULLS LAST
        LIMIT $2
        """,
        *params,
    )
    return [_visitor(row) for row in rows]


async def profile(domain_id: Any, visitor_id: str) -> dict[str, Any] | None:
    """The visitor, their sessions and their timeline; None when not on this site."""
    row = await query_one(
        f"""
        SELECT v.id, v.visitor_id, v.first_seen, v.last_seen,
               who.user_id, who.email, who.name,
               counts.sessions, counts.pageviews,
               last.country, last.city, last.device, last.os, last.device_model, last.source
        FROM visitors v
        {_IDENTITY_SQL}
        {_COUNTS_SQL}
        {_LAST_SESSION_SQL}
        WHERE v.domain_id = $1 AND v.id::text = $2
        """,
        domain_id,
        visitor_id,
    )
    if row is None:
        return None

    sessions = await query(
        f"""
        SELECT s.id, s.started_at, s.ended_at, s.pageviews, s.source, s.source_type,
               s.country, s.city, {device_case_sql("s.screen_width")} AS device,
               (SELECT r.id FROM session_recordings r
                WHERE r.session_id = s.id ORDER BY r.started_at LIMIT 1) AS recording_id
        FROM sessions s
        WHERE s.visitor_id = $1
        ORDER BY s.started_at DESC
        LIMIT $2
        """,
        row["id"],
        SESSIONS_LIMIT,
    )
    events = await query(
        """
        SELECT e.type, e.url, e.data, e.session_id, e.created_at
        FROM events e
        WHERE e.visitor_id = $1 AND e.type = ANY($2::text[])
          AND NOT (e.type = 'custom' AND e.data->>'event' IN ('performance', 'identify'))
        ORDER BY e.created_at DESC
        LIMIT $3
        """,
        row["id"],
        list(TIMELINE_TYPES),
        TIMELINE_LIMIT,
    )
    return {
        "visitor": _visitor(row),
        "sessions": [
            {
                "id": s["id"],
                "startedAt": s["started_at"],
                "endedAt": s["ended_at"],
                "pageviews": int(s["pageviews"] or 0),
                "source": s["source"],
                "sourceType": s["source_type"],
                "country": s["country"],
                "city": s["city"],
                "device": s["device"],
                "recordingId": s["recording_id"],
            }
            for s in sessions
        ],
        "timeline": [timeline_item(e) for e in events],
    }


def timeline_item(event: dict[str, Any]) -> dict[str, Any]:
    """One line of the timeline: what kind of thing happened, and its label."""
    data = event["data"] if isinstance(event["data"], dict) else {}
    kind = event["type"]
    label = event["url"]
    if kind == "custom":
        name = str(data.get("event") or "event")
        if name == "error":
            kind, label = "error", str(data.get("message") or "JavaScript error")
        elif name == "rage_click":
            kind, label = "rage_click", str(data.get("text") or data.get("selector") or "")
        elif name == "feedback":
            answer = "Yes" if data.get("answer") == "yes" else "No"
            comment = str(data.get("comment") or "").strip()
            kind, label = "feedback", f"{answer}: {comment}" if comment else answer
        else:
            kind, label = "event", name
    elif kind == "form":
        label = str(data.get("formId") or data.get("formName") or data.get("action") or "Form")
    return {
        "type": kind,
        "label": label[:300],
        "url": event["url"],
        "sessionId": event["session_id"],
        "at": event["created_at"],
    }
