"""Data retention: what each plan keeps, what is past it, and removing it.

Each domain's retention comes from its owner's *effective* plan — the latest active
subscription, else free — the same rule that decides features and limits. The old
cleanup read `users.subscription`, which can disagree with billing.

One difference: a paid period that lapsed keeps its plan's retention for
`LAPSED_RETENTION_HOLD_DAYS` after grace, so an owner who renews late finds their
history intact. After that hold the owner drops to the free policy and everything
older is due at once; `expired_counts()` reports those rows separately as
`fromInactivePaidOwners` so a dry run shows the size of that cliff first.
"""

from __future__ import annotations

from typing import Any

from ..db import query
from .plan_service import LAPSED_RETENTION_HOLD_DAYS, entitled

# (table, timestamp column, policy column) — sessions last: deleting a session
# cascades to its events and recordings, which are counted under their own tables.
TABLES = (
    ("events", "created_at", "events_days"),
    ("session_recordings", "started_at", "recordings_days"),
    ("heatmap_data", "created_at", "heatmaps_days"),
    ("sessions", "started_at", "sessions_days"),
)

REPORT_KEYS = {
    "events": "events",
    "session_recordings": "recordings",
    "heatmap_data": "heatmaps",
    "sessions": "sessions",
}

DELETE_BATCH_SIZE = 5_000


def _domain_policy(policy_column: str) -> str:
    """Per domain: its owner's effective plan, that plan's retention days, and whether
    the owner was on a paid plan whose subscription is no longer active."""
    return f"""
        SELECT d.id AS domain_id, ep.plan, p.{policy_column} AS days,
               (ep.plan = 'free' AND COALESCE(u.subscription, 'free') <> 'free')
                   AS inactive_paid
        FROM domains d
        JOIN users u ON u.id = d.user_id
        CROSS JOIN LATERAL (
            SELECT LOWER(COALESCE(
                (SELECT s.plan FROM subscriptions s
                 WHERE s.user_id = d.user_id
                   AND {entitled("s", LAPSED_RETENTION_HOLD_DAYS)}
                 ORDER BY s.created_at DESC LIMIT 1),
                'free')) AS plan
        ) ep
        JOIN data_retention_policies p ON p.plan = ep.plan
    """


async def expired_counts() -> dict[str, Any]:
    """Rows past retention, per plan and table, without deleting anything."""
    by_plan: dict[str, dict[str, int]] = {}
    inactive_paid = 0

    for table, column, policy_column in TABLES:
        rows = await query(
            f"""
            WITH domain_policy AS ({_domain_policy(policy_column)})
            SELECT dp.plan, dp.inactive_paid, COUNT(*)::int AS count
            FROM {table} t
            JOIN domain_policy dp ON dp.domain_id = t.domain_id
            WHERE t.{column} < NOW() - make_interval(days => dp.days)
            GROUP BY dp.plan, dp.inactive_paid
            """
        )
        for row in rows:
            counts = by_plan.setdefault(row["plan"], {key: 0 for key in REPORT_KEYS.values()})
            counts[REPORT_KEYS[table]] += row["count"]
            if row["inactive_paid"]:
                inactive_paid += row["count"]

    return {"byPlan": by_plan, "fromInactivePaidOwners": inactive_paid}


async def delete_expired(batch_size: int = DELETE_BATCH_SIZE) -> dict[str, int]:
    """Delete rows past retention in batches, so no single transaction is huge."""
    deleted: dict[str, int] = {}

    for table, column, policy_column in TABLES:
        total = 0
        while True:
            rows = await query(
                f"""
                WITH domain_policy AS ({_domain_policy(policy_column)}),
                doomed AS (
                    SELECT t.id FROM {table} t
                    JOIN domain_policy dp ON dp.domain_id = t.domain_id
                    WHERE t.{column} < NOW() - make_interval(days => dp.days)
                    LIMIT $1
                )
                DELETE FROM {table} WHERE id IN (SELECT id FROM doomed)
                RETURNING 1
                """,
                batch_size,
            )
            total += len(rows)
            if len(rows) < batch_size:
                break
        deleted[REPORT_KEYS[table]] = total

    return deleted
