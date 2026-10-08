"""Recording service — port of `services/recordingService.ts`.

Two storage formats (`session_recordings.format`):

* `rrweb` — screen recordings from the current tracker. Each upload is one
  `recording_chunks` row holding its events as gzip-compressed JSON.
* `legacy` — cursor-only events from the old tracker, appended to the
  `recording_data` jsonb. Old cached trackers may still send them for a while.
"""

from __future__ import annotations

import gzip
import json
from typing import Any

from ..db import query, query_one
from . import session_service
from .recording_scrub import scrub_events


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


# Compressed bytes one recording may hold; uploads past it are dropped. A busy
# 10-minute visit is typically well under 1 MB.
MAX_RECORDING_BYTES = 5 * 1024 * 1024


async def append_rrweb_events(recording_id: str, events: list[dict[str, Any]]) -> bool:
    """Store one upload of rrweb events; False when the recording is full.

    rrweb timestamps are the visitor's clock in epoch ms, so the duration is the
    span between the earliest and latest event seen — right even when the page
    never says the recording ended. `ended_at` follows the latest upload.

    Typed values are masked first (see `recording_scrub`), whatever the tracker sent.
    """
    events = scrub_events(events)
    data = gzip.compress(json.dumps(events, separators=(",", ":")).encode("utf-8"))
    timestamps = [event["timestamp"] for event in events]
    row = await query_one(
        """
        WITH rec AS (
            UPDATE session_recordings
            SET format = 'rrweb',
                events_count = COALESCE(events_count, 0) + $2,
                first_event_ms = LEAST(COALESCE(first_event_ms, $3), $3),
                last_event_ms = GREATEST(COALESCE(last_event_ms, $4), $4),
                duration = CEIL((
                    GREATEST(COALESCE(last_event_ms, $4), $4)
                    - LEAST(COALESCE(first_event_ms, $3), $3)
                ) / 1000.0)::int,
                size_bytes = size_bytes + $5,
                ended_at = NOW()
            WHERE id = $1 AND size_bytes + $5 <= $6
            RETURNING id
        )
        INSERT INTO recording_chunks (recording_id, events_count, data)
        SELECT id, $2, $7 FROM rec
        RETURNING id
        """,
        recording_id,
        len(events),
        int(min(timestamps)),
        int(max(timestamps)),
        len(data),
        MAX_RECORDING_BYTES,
        data,
    )
    return row is not None


async def rrweb_events_json(recording_id: str) -> str:
    """The recording's events as one JSON array, in upload order.

    Built from the stored JSON text without parsing it, so a large recording
    costs little memory. Uploads sent as the page closed can arrive out of
    order; the player sorts by timestamp.
    """
    rows = await query(
        "SELECT data FROM recording_chunks WHERE recording_id = $1 ORDER BY id",
        recording_id,
    )
    parts = [gzip.decompress(row["data"]).decode("utf-8")[1:-1] for row in rows]
    return "[" + ",".join(part for part in parts if part) + "]"


async def count_started_today(domain_id: str) -> int:
    """Recordings this domain started since midnight UTC (the daily limit's day)."""
    row = await query_one(
        """
        SELECT COUNT(*)::int AS count FROM session_recordings
        WHERE domain_id = $1
          AND started_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        """,
        domain_id,
    )
    return int((row or {}).get("count") or 0)


async def count_started_today_for_owner(owner_id: str) -> int:
    """Recordings started since midnight UTC across all of an owner's sites (the
    plan's `recordings_per_day` counts per account, not per site)."""
    row = await query_one(
        """
        SELECT COUNT(*)::int AS count FROM session_recordings r
        JOIN domains d ON d.id = r.domain_id
        WHERE d.user_id = $1
          AND r.started_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        """,
        owner_id,
    )
    return int((row or {}).get("count") or 0)


async def append_events(
    recording_id: str, new_events: list[Any]
) -> dict[str, Any] | None:
    """Append events and keep `duration` up to date from the latest one.

    The list is passed as-is: the connection's jsonb codec encodes it. Encoding it
    here as well stored each batch as one JSON *string* inside `events`, so the
    player found no events to replay.

    Event timestamps are milliseconds since the recording started, so the duration
    is known before the end beacon arrives - and stays right if it never does (a
    phone backgrounding the page rarely sends one).
    """
    latest_ms = max(
        (e.get("timestamp") for e in new_events if isinstance(e.get("timestamp"), int | float)),
        default=0,
    )
    return await query_one(
        """
        UPDATE session_recordings
        SET format = 'legacy',
            recording_data = jsonb_set(
               COALESCE(recording_data, '{"events":[]}'::jsonb),
               '{events}',
               COALESCE(recording_data->'events', '[]'::jsonb) || $2::jsonb
            ),
            events_count = COALESCE(events_count, 0) + $3,
            duration = GREATEST(COALESCE(duration, 0), CEIL($4::float / 1000)::int)
        WHERE id = $1
        RETURNING *
        """,
        recording_id,
        new_events,
        len(new_events),
        latest_ms,
    )


async def end_recording(recording_id: str) -> dict[str, Any] | None:
    return await query_one(
        """
        UPDATE session_recordings
        SET ended_at = NOW(),
            -- Never shorter than the recorded events (see append_events).
            duration = GREATEST(
                COALESCE(duration, 0), EXTRACT(EPOCH FROM (NOW() - started_at))::int
            ),
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
               r.started_at, r.ended_at, r.format, NULL as recording_data,
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


async def get_by_id_light(recording_id: str) -> dict[str, Any] | None:
    """The row without its `recording_data` blob, for ownership checks."""
    return await query_one(
        """
        SELECT id, domain_id, session_id, url, duration, events_count, format,
               started_at, ended_at
        FROM session_recordings WHERE id = $1
        """,
        recording_id,
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
