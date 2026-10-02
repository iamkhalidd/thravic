"""Recording service — port of `services/recordingService.ts`."""

from __future__ import annotations

import json
from typing import Any

from ..db import query, query_one


async def create(
    domain_id: str, session_id: str | None, url: str
) -> dict[str, Any] | None:
    rows = await query(
        """
        INSERT INTO session_recordings (domain_id, session_id, url, recording_data)
        VALUES ($1, $2, $3, '{"events":[]}')
        RETURNING *
        """,
        domain_id,
        session_id,
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
            duration = EXTRACT(EPOCH FROM (NOW() - started_at))::int
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
