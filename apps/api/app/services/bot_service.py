"""Bot traffic: counting what was turned away, and moving bot visits out of the way.

Two layers (see `ml.bots` for the rules and the score):

* At collection, an event whose request is a bot by rule is not stored;
  `record_hit` counts it in `bot_hits`.
* Every hour, `check_domain` scores visits that have gone quiet. A bot visit is
  moved, session row and events, into `bot_sessions`. Every dashboard page,
  report, alert and model reads `sessions` and `events`, so moving the visit
  out is what keeps it out of all of them. A person's visit is marked
  `bot_checked_at` and not looked at again.

Visits with a recording stay where they are: the owner may want to watch it.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from ..db import query
from ..ml import bots
from . import domain_service

QUIET_FOR = timedelta(minutes=30)  # a visit is scored once it has been idle this long
LOOK_BACK = timedelta(days=2)
MAX_PER_SITE = 2000  # visits scored per site per run
MAX_PAGE_TIMES = 200
MAX_EVENTS_KEPT = 500  # events kept with a bot visit for review
KEEP_SESSIONS_FOR = timedelta(days=30)
KEEP_HITS_FOR = timedelta(days=90)
RECENT = 20


async def record_hit(domain_id: Any, reason: str, user_agent: str | None, hits: int = 1) -> None:
    await query(
        """
        INSERT INTO bot_hits (domain_id, day, reason, hits, sample_user_agent)
        VALUES ($1, (NOW() AT TIME ZONE 'UTC')::date, $2, $3, LEFT($4, 300))
        ON CONFLICT (domain_id, day, reason) DO UPDATE
        SET hits = bot_hits.hits + EXCLUDED.hits,
            sample_user_agent = COALESCE(EXCLUDED.sample_user_agent, bot_hits.sample_user_agent),
            updated_at = NOW()
        RETURNING 1
        """,
        domain_id,
        reason,
        hits,
        user_agent or None,
    )


_CANDIDATES_SQL = f"""
SELECT s.id, s.user_agent, s.referrer, s.screen_width,
       (SELECT array_agg(t ORDER BY t) FROM (
            SELECT EXTRACT(EPOCH FROM e.created_at)::float8 AS t
            FROM events e WHERE e.session_id = s.id AND e.type = 'pageview'
            ORDER BY e.created_at LIMIT {MAX_PAGE_TIMES}) p) AS times,
       (SELECT COUNT(*) FROM events e
         WHERE e.session_id = s.id AND e.type IN ('click', 'scroll', 'form'))::int AS interactions,
       (SELECT COUNT(*) FROM sessions v
         WHERE v.visitor_id = s.visitor_id AND v.domain_id = s.domain_id
           AND v.started_at > s.started_at - INTERVAL '1 day'
           AND v.started_at <= s.started_at)::int AS visits
FROM sessions s
WHERE s.domain_id = $1 AND s.started_at >= $2 AND s.bot_checked_at IS NULL
  AND COALESCE(s.ended_at, s.started_at) < $3
  AND NOT EXISTS (SELECT 1 FROM session_recordings r WHERE r.session_id = s.id)
ORDER BY s.started_at
LIMIT {MAX_PER_SITE}
"""

# One statement, so the copy and the delete happen together. Deleting the
# session deletes its events (ON DELETE CASCADE).
_QUARANTINE_SQL = f"""
WITH s AS (SELECT * FROM sessions WHERE id = $1 AND domain_id = $2),
kept AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.created_at), '[]'::jsonb) AS events
    FROM (SELECT * FROM events WHERE session_id = $1
          ORDER BY created_at LIMIT {MAX_EVENTS_KEPT}) e
),
total AS (SELECT COUNT(*)::int AS n FROM events WHERE session_id = $1),
moved AS (
    INSERT INTO bot_sessions (id, domain_id, started_at, score, reasons, pageviews,
                              events_count, session, events)
    SELECT s.id, s.domain_id, s.started_at, $3, $4, COALESCE(s.pageviews, 0), total.n,
           to_jsonb(s), kept.events
    FROM s, kept, total
    ON CONFLICT (id) DO NOTHING
    RETURNING id
)
DELETE FROM sessions WHERE id IN (SELECT id FROM moved) RETURNING 1
"""


def signals(row: dict[str, Any], tracks_interactions: bool) -> bots.Signals:
    return bots.Signals(
        user_agent=row["user_agent"],
        referrer=row["referrer"],
        screen_width=row["screen_width"],
        pageview_times=list(row["times"] or []),
        interactions=row["interactions"],
        tracks_interactions=tracks_interactions,
        visitor_visits_today=max(row["visits"] or 0, 1),
    )


async def check_domain(domain: dict[str, Any], now: datetime | None = None) -> dict[str, int]:
    """Score this site's quiet, unchecked visits; move the bots out."""
    if domain_service.is_app(domain):
        return {"checked": 0, "flagged": 0}
    now = now or datetime.now(UTC)
    settings = domain_service.effective_settings(domain)
    tracks = bool(settings["trackClicks"] or settings["trackScrolls"])

    rows = await query(_CANDIDATES_SQL, domain["id"], now - LOOK_BACK, now - QUIET_FOR)
    people, flagged = [], 0
    for row in rows:
        total, reasons = bots.score(signals(row, tracks))
        if total >= bots.FLAG_SCORE:
            await query(_QUARANTINE_SQL, row["id"], domain["id"], total, reasons)
            flagged += 1
        else:
            people.append(row["id"])
    if people:
        await query(
            "UPDATE sessions SET bot_checked_at = NOW() WHERE id = ANY($1::uuid[]) RETURNING 1",
            people,
        )
    return {"checked": len(rows), "flagged": flagged}


async def remove_old(now: datetime | None = None) -> None:
    now = now or datetime.now(UTC)
    await query(
        "DELETE FROM bot_sessions WHERE flagged_at < $1 RETURNING 1", now - KEEP_SESSIONS_FOR
    )
    await query("DELETE FROM bot_hits WHERE day < $1 RETURNING 1", (now - KEEP_HITS_FOR).date())


async def summary(domain_id: str, days: int = 30) -> dict[str, Any]:
    """What was filtered on a site in the last `days` days, for the owner to review."""
    since = datetime.now(UTC) - timedelta(days=days)
    hits = await query(
        """
        SELECT reason, SUM(hits)::int AS hits,
               (array_agg(sample_user_agent ORDER BY updated_at DESC))[1] AS sample
        FROM bot_hits WHERE domain_id = $1 AND day >= $2
        GROUP BY reason ORDER BY 2 DESC
        """,
        domain_id,
        since.date(),
    )
    reasons = await query(
        """
        SELECT reason, COUNT(*)::int AS visits
        FROM bot_sessions, unnest(reasons) AS reason
        WHERE domain_id = $1 AND flagged_at >= $2
        GROUP BY reason ORDER BY 2 DESC
        """,
        domain_id,
        since,
    )
    recent = await query(
        f"""
        SELECT id::text, started_at, score, reasons, pageviews, events_count,
               session->>'user_agent' AS user_agent, session->>'country' AS country,
               (SELECT ev->>'url' FROM jsonb_array_elements(events) ev
                 WHERE ev->>'type' = 'pageview' LIMIT 1) AS landing_url
        FROM bot_sessions
        WHERE domain_id = $1 AND flagged_at >= $2
        ORDER BY flagged_at DESC LIMIT {RECENT}
        """,
        domain_id,
        since,
    )
    flagged = await query(
        "SELECT COUNT(*)::int AS n FROM bot_sessions WHERE domain_id = $1 AND flagged_at >= $2",
        domain_id,
        since,
    )
    return {
        "days": days,
        "turnedAway": sum(r["hits"] for r in hits),
        "turnedAwayByReason": [
            {"reason": r["reason"], "events": r["hits"], "sampleUserAgent": r["sample"]}
            for r in hits
        ],
        "flaggedVisits": flagged[0]["n"] if flagged else 0,
        "flaggedByReason": [{"reason": r["reason"], "visits": r["visits"]} for r in reasons],
        "recent": [
            {
                "id": r["id"],
                "startedAt": r["started_at"],
                "score": r["score"],
                "reasons": list(r["reasons"] or []),
                "pageviews": r["pageviews"],
                "events": r["events_count"],
                "userAgent": r["user_agent"],
                "country": r["country"],
                "landingUrl": r["landing_url"],
            }
            for r in recent
        ],
    }
