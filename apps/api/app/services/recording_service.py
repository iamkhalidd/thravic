"""Recording service — port of `services/recordingService.ts`."""

from __future__ import annotations

import json
from typing import Any

from ..db import query, query_one
from . import session_service


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


# Duration classes in seconds: [lower, upper). Recordings still in progress have
# no duration and match none of them.
DURATIONS: dict[str, tuple[int, int | None]] = {
    "short": (0, 30),
    "medium": (30, 180),
    "long": (180, None),
}

# Recordings reach their session through the tracker's id, which is set even when
# the `session_id` FK could not be resolved yet (see `create`).
_SESSION_JOIN = """
    LEFT JOIN sessions s
      ON s.session_id = r.client_session_id AND s.domain_id = r.domain_id
"""


def _filter_sql(
    device: str | None, duration: str | None, first_param: int
) -> tuple[str, list[Any]]:
    """Extra `AND ...` conditions for the list and count queries, plus their params."""
    clauses: list[str] = []
    params: list[Any] = []

    if device is not None:
        sql, device_params = session_service.device_width_sql(
            "s.screen_width", device, first_param + len(params)
        )
        clauses.append(sql)
        params.extend(device_params)

    if duration is not None:
        lower, upper = DURATIONS[duration]
        clauses.append(f"r.duration >= ${first_param + len(params)}")
        params.append(lower)
        if upper is not None:
            clauses.append(f"r.duration < ${first_param + len(params)}")
            params.append(upper)

    return "".join(f" AND {clause}" for clause in clauses), params


async def list_by_domain(
    domain_id: str,
    limit: int = 20,
    offset: int = 0,
    device: str | None = None,
    duration: str | None = None,
) -> list[dict[str, Any]]:
    """List view deliberately omits the `recording_data` blob (returned NULL).

    `device` is the session's device class (`unknown` without a linked session).
    """
    filters, params = _filter_sql(device, duration, 4)
    return await query(
        f"""
        SELECT r.id, r.domain_id, r.session_id, r.url, r.duration, r.events_count,
               r.started_at, r.ended_at, NULL as recording_data,
               {session_service.device_case_sql("s.screen_width")} AS device
        FROM session_recordings r
        {_SESSION_JOIN}
        WHERE r.domain_id = $1{filters}
        ORDER BY r.started_at DESC
        LIMIT $2 OFFSET $3
        """,
        domain_id,
        limit,
        offset,
        *params,
    )


async def get_by_id(recording_id: str) -> dict[str, Any] | None:
    return await query_one(
        "SELECT * FROM session_recordings WHERE id = $1", recording_id
    )


async def remove(recording_id: str) -> None:
    await query("DELETE FROM session_recordings WHERE id = $1", recording_id)


async def count_by_domain(
    domain_id: str, device: str | None = None, duration: str | None = None
) -> int:
    """Counts with the same filters as `list_by_domain`, so pagination agrees."""
    filters, params = _filter_sql(device, duration, 2)
    row = await query_one(
        f"""
        SELECT COUNT(*)::text as count
        FROM session_recordings r
        {_SESSION_JOIN}
        WHERE r.domain_id = $1{filters}
        """,
        domain_id,
        *params,
    )
    return int((row or {}).get("count") or "0")
