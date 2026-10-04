"""Event data access — port of `services/eventService.ts` (raw SQL preserved).

Important parity detail: the Express counters select `COUNT(*)::text` and then
`parseInt(...)` in JavaScript, so they leave the API as **numbers**. Because the
asyncpg `int8` codec deliberately returns a string (matching node-postgres), every
count here must be converted with `int(...)` to land on the same JSON type.
Queries using `::int` (int4) already arrive as Python ints.

The inserts resolve `session_id`/`visitor_id` to the surrogate rows in `sessions`
and `visitors`. Both columns are UUID foreign keys; the tracker's own generated
ids are held on the *natural* keys (`sessions.session_id`, `visitors.visitor_id`),
so writing them straight into the foreign key columns violated the constraints and
rolled every batch back.

Every insert is idempotent on `event_id`: the tracker retries failed batches and
replays its queue, so the same event can arrive twice. `ON CONFLICT DO NOTHING`
makes the second delivery a no-op rather than a second pageview.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from ..db import query, query_one, transaction

DEFAULT_TOP_PAGES_LIMIT = 10
DEFAULT_REALTIME_WINDOW_MINUTES = 30


async def insert_event(params: dict[str, Any]) -> dict[str, Any] | None:
    rows = await query(
        """
        INSERT INTO events (domain_id, session_id, visitor_id, event_id, type, url,
                            referrer, utm_source, utm_medium, utm_campaign, data)
        VALUES ($1,
                (SELECT id FROM sessions WHERE session_id = $2 AND domain_id = $1),
                (SELECT id FROM visitors WHERE visitor_id = $3 AND domain_id = $1),
                $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (event_id) DO NOTHING
        RETURNING *
        """,
        params["domainId"],
        params.get("sessionId") or None,
        params.get("visitorId") or None,
        params.get("eventId") or None,
        params["type"],
        params["url"],
        params.get("referrer") or None,
        params.get("utmSource") or None,
        params.get("utmMedium") or None,
        params.get("utmCampaign") or None,
        params.get("data"),  # jsonb codec serializes dicts; pass the object, not a string
    )
    return rows[0] if rows else None


async def batch_insert(event_list: list[dict[str, Any]]) -> int:
    """Insert many events in one transaction; returns the number actually stored.

    A duplicate `eventId` is ignored, so a retried batch reports the rows written
    rather than the rows offered — the same batch sent twice stores once.
    """
    if not event_list:
        return 0

    inserted = 0
    async with transaction() as conn:
        for event in event_list:
            rows = await conn.fetch(
                """
                INSERT INTO events (domain_id, session_id, visitor_id, event_id, type,
                                    url, referrer, utm_source, utm_medium, utm_campaign, data)
                VALUES ($1,
                        (SELECT id FROM sessions WHERE session_id = $2 AND domain_id = $1),
                        (SELECT id FROM visitors WHERE visitor_id = $3 AND domain_id = $1),
                        $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (event_id) DO NOTHING
                RETURNING id
                """,
                event["domainId"],
                event.get("sessionId") or None,
                event.get("visitorId") or None,
                event.get("eventId") or None,
                event["type"],
                event["url"],
                event.get("referrer") or None,
                event.get("utmSource") or None,
                event.get("utmMedium") or None,
                event.get("utmCampaign") or None,
                event.get("data"),
            )
            inserted += len(rows)
    return inserted


async def query_by_domain(
    domain_id: str,
    start_date: datetime,
    end_date: datetime,
    event_type: str | None = None,
) -> list[dict[str, Any]]:
    if event_type:
        return await query(
            """
            SELECT * FROM events
            WHERE domain_id = $1 AND created_at >= $2 AND created_at <= $3 AND type = $4
            ORDER BY created_at DESC
            """,
            domain_id,
            start_date,
            end_date,
            event_type,
        )
    return await query(
        """
        SELECT * FROM events
        WHERE domain_id = $1 AND created_at >= $2 AND created_at <= $3
        ORDER BY created_at DESC
        """,
        domain_id,
        start_date,
        end_date,
    )


async def count_by_domain(
    domain_id: str,
    start_date: datetime,
    end_date: datetime,
    event_type: str | None = None,
) -> int:
    sql = (
        "SELECT COUNT(*)::text as count FROM events "
        "WHERE domain_id = $1 AND created_at >= $2 AND created_at <= $3"
    )
    params: list[Any] = [domain_id, start_date, end_date]
    if event_type:
        sql += " AND type = $4"
        params.append(event_type)

    row = await query_one(sql, *params)
    return int((row or {}).get("count") or "0")


async def count_unique_visitors(
    domain_id: str, start_date: datetime, end_date: datetime
) -> int:
    row = await query_one(
        """
        SELECT COUNT(DISTINCT visitor_id)::text as count FROM events
        WHERE domain_id = $1 AND created_at >= $2 AND created_at <= $3
        """,
        domain_id,
        start_date,
        end_date,
    )
    return int((row or {}).get("count") or "0")


async def get_top_pages(
    domain_id: str,
    start_date: datetime,
    end_date: datetime,
    limit: int = DEFAULT_TOP_PAGES_LIMIT,
) -> list[dict[str, Any]]:
    return await query(
        """
        SELECT url, COUNT(*)::int as views FROM events
        WHERE domain_id = $1 AND created_at >= $2 AND created_at <= $3
          AND type = 'pageview'
        GROUP BY url
        ORDER BY views DESC
        LIMIT $4
        """,
        domain_id,
        start_date,
        end_date,
        limit,
    )


async def get_timeseries(
    domain_id: str,
    start_date: datetime,
    end_date: datetime,
    interval: str = "day",
) -> list[dict[str, Any]]:
    trunc = "hour" if interval == "hour" else "day"
    return await query(
        """
        SELECT
            date_trunc($4, created_at)::text as bucket,
            COUNT(*) FILTER (WHERE type = 'pageview')::int as pageviews,
            COUNT(DISTINCT visitor_id)::int as visitors
        FROM events
        WHERE domain_id = $1 AND created_at >= $2 AND created_at <= $3
        GROUP BY bucket
        ORDER BY bucket
        """,
        domain_id,
        start_date,
        end_date,
        trunc,
    )


async def get_recent_events(
    domain_id: str, since_minutes: int = DEFAULT_REALTIME_WINDOW_MINUTES
) -> list[dict[str, Any]]:
    return await query(
        """
        SELECT * FROM events
        WHERE domain_id = $1
          AND created_at >= NOW() - ($2 || ' minutes')::interval
        ORDER BY created_at DESC
        """,
        domain_id,
        str(since_minutes),
    )


async def count_realtime_visitors(
    domain_id: str, since_minutes: int = DEFAULT_REALTIME_WINDOW_MINUTES
) -> int:
    row = await query_one(
        """
        SELECT COUNT(DISTINCT visitor_id)::text as count FROM events
        WHERE domain_id = $1
          AND created_at >= NOW() - ($2 || ' minutes')::interval
        """,
        domain_id,
        str(since_minutes),
    )
    return int((row or {}).get("count") or "0")


async def query_by_tracking_id(
    tracking_id: str, start_date: datetime, end_date: datetime
) -> list[dict[str, Any]]:
    return await query(
        """
        SELECT e.* FROM events e
        JOIN domains d ON d.id = e.domain_id
        WHERE d.tracking_id = $1 AND e.created_at >= $2 AND e.created_at <= $3
        ORDER BY e.created_at DESC
        """,
        tracking_id,
        start_date,
        end_date,
    )


async def get_source_breakdown(
    domain_id: str, start_date: datetime, end_date: datetime
) -> list[dict[str, Any]]:
    return await query(
        """
        SELECT utm_source, referrer, COUNT(*)::int as count FROM events
        WHERE domain_id = $1 AND created_at >= $2 AND created_at <= $3
        GROUP BY utm_source, referrer
        ORDER BY count DESC
        """,
        domain_id,
        start_date,
        end_date,
    )


async def get_user_paths(
    domain_id: str,
    start_date: datetime,
    end_date: datetime,
    limit: int = 10,
) -> list[dict[str, Any]]:
    return await query(
        """
        WITH numbered_events AS (
            SELECT
                url as source_url,
                LEAD(url) OVER (PARTITION BY session_id ORDER BY created_at) as target_url
            FROM events
            WHERE domain_id = $1 AND created_at >= $2 AND created_at <= $3
              AND type = 'pageview'
        )
        SELECT source_url, target_url, COUNT(*)::int as count
        FROM numbered_events
        WHERE target_url IS NOT NULL AND source_url != target_url
        GROUP BY source_url, target_url
        ORDER BY count DESC
        LIMIT $4
        """,
        domain_id,
        start_date,
        end_date,
        limit,
    )


async def get_entries_and_exits(
    domain_id: str,
    start_date: datetime,
    end_date: datetime,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Entry and exit pages, returned as one union ordered by count.

    `limit` is accepted for signature parity but unused — the Express query ignores
    it too and the caller slices the result.
    """
    return await query(
        """
        WITH session_edges AS (
            SELECT
                session_id,
                FIRST_VALUE(url) OVER w AS entry_url,
                LAST_VALUE(url) OVER w AS exit_url
            FROM events
            WHERE domain_id = $1 AND created_at >= $2 AND created_at <= $3
              AND type = 'pageview'
            WINDOW w AS (PARTITION BY session_id ORDER BY created_at
                         ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
        ),
        distinct_edges AS (
            SELECT DISTINCT session_id, entry_url, exit_url FROM session_edges
        ),
        entries AS (
            SELECT entry_url as url, true as is_entry, false as is_exit, COUNT(*)::int as count
            FROM distinct_edges GROUP BY entry_url
        ),
        exits AS (
            SELECT exit_url as url, false as is_entry, true as is_exit, COUNT(*)::int as count
            FROM distinct_edges GROUP BY exit_url
        )
        SELECT * FROM entries
        UNION ALL
        SELECT * FROM exits
        ORDER BY count DESC
        """,
        domain_id,
        start_date,
        end_date,
    )
