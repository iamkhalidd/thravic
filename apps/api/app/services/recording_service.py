"""Recording service — port of `services/recordingService.ts`."""

from __future__ import annotations

import json
from typing import Any

from ..db import query, query_one


async def create(
    domain_id: str, client_session_id: str | None, url: str
) -> dict[str, Any] | None:
    """`session_id` is the FK to `sessions.id`; callers only know the tracker's
    client-side id (`sessions.session_id`), so it is resolved here.

    The tracker starts recording before its first pageview is flushed, so the
    session row may not exist yet: the link stays NULL and `end_recording`
    resolves it again from `client_session_id`.
    """
    rows = await query(
        """
        INSERT INTO session_recordings
            (domain_id, session_id, client_session_id, url, recording_data)
        VALUES (
            $1,
            (SELECT id FROM sessions WHERE session_id = $2 AND domain_id = $1),
            $2, $3, '{"events":[]}'
        )
        RETURNING *
        """,
        domain_id,
        client_session_id,
        url,
    )
    return rows[0] if rows else None


async def append_events(
    recording_id: str, new_events: list[Any]
) -> dict[str, Any] | None:
    # The array is serialized explicitly because it is concatenated inside the
    # query with `||` rather than passed as a jsonb parameter.
    return await query_one(
        """
        UPDATE session_recordings
        SET recording_data = jsonb_set(
               recording_data,
               '{events}',
               (recording_data->'events')::jsonb || $2::jsonb
            ),
            events_count = COALESCE(events_count, 0) + $3
        WHERE id = $1
        RETURNING *
        """,
        recording_id,
        json.dumps(new_events),
        len(new_events),
    )


async def end_recording(recording_id: str) -> dict[str, Any] | None:
    return await query_one(
        """
        UPDATE session_recordings
        SET ended_at = NOW(),
            duration = EXTRACT(EPOCH FROM (NOW() - started_at))::int,
            session_id = COALESCE(session_id, (
                SELECT s.id FROM sessions s
                WHERE s.session_id = session_recordings.client_session_id
                  AND s.domain_id = session_recordings.domain_id
            ))
        WHERE id = $1
        RETURNING *
        """,
        recording_id,
    )


async def list_by_domain(
    domain_id: str, limit: int = 20, offset: int = 0
) -> list[dict[str, Any]]:
    """List view deliberately omits the `recording_data` blob (returned NULL)."""
    return await query(
        """
        SELECT id, domain_id, session_id, url, duration, events_count,
               started_at, ended_at, NULL as recording_data
        FROM session_recordings
        WHERE domain_id = $1
        ORDER BY started_at DESC
        LIMIT $2 OFFSET $3
        """,
        domain_id,
        limit,
        offset,
    )


async def get_by_id(recording_id: str) -> dict[str, Any] | None:
    return await query_one(
        "SELECT * FROM session_recordings WHERE id = $1", recording_id
    )


async def remove(recording_id: str) -> None:
    await query("DELETE FROM session_recordings WHERE id = $1", recording_id)


async def count_by_domain(domain_id: str) -> int:
    row = await query_one(
        "SELECT COUNT(*)::text as count FROM session_recordings WHERE domain_id = $1",
        domain_id,
    )
    return int((row or {}).get("count") or "0")
