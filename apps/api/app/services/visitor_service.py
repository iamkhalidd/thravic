"""Visitor records — the surrogate `visitors.id` the ingestion path must resolve.

`visitors` has a natural key of `(visitor_id, domain_id)` — the id the tracking
script generates in the browser — plus a server-generated UUID primary key. Every
foreign key in the schema (`sessions.visitor_id`, `events.visitor_id`) points at
that *surrogate* `id`, never at the client-side string. Nothing used to create the
row at all, so those constraints could never be satisfied and ingestion silently
failed; this service is what closes that gap.
"""

from __future__ import annotations

from typing import Any

from ..db import query


async def upsert(domain_id: Any, visitor_id: str | None) -> dict[str, Any] | None:
    """Insert-or-touch `(visitor_id, domain_id)` and return the row.

    Returns `None` when the tracker sent no visitor id, so callers store a NULL
    foreign key rather than inventing a visitor.
    """
    if not visitor_id:
        return None

    rows = await query(
        """
        INSERT INTO visitors (visitor_id, domain_id, last_seen)
        VALUES ($1, $2, NOW())
        ON CONFLICT (visitor_id, domain_id)
        DO UPDATE SET last_seen = NOW()
        RETURNING *
        """,
        visitor_id,
        domain_id,
    )
    return rows[0] if rows else None
