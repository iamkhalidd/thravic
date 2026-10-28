"""Feedback widget answers: the yes/no question the tracker can show visitors.

The widget is switched on per site (`settings.feedbackWidget`, question in
`settings.feedbackQuestion`). Each answer arrives as an ordinary custom event,
`{event: 'feedback', answer: 'yes'|'no', comment?, question}`, so it needs no
table of its own, appears on the visitor's timeline, and reaches webhooks,
Slack and Zapier as a `feedback` event.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from ..db import query
from ..js_compat import url_path

COMMENT_MAX_LENGTH = 1000
RECENT_LIMIT = 100
PAGES_LIMIT = 10

_FEEDBACK = "e.domain_id = $1 AND e.type = 'custom' AND e.data->>'event' = 'feedback'"


async def summary(domain_id: Any, start: datetime, end: datetime) -> dict[str, Any]:
    """Yes and no counts, answers per page, and the latest answers with comments."""
    totals = await query(
        f"""
        SELECT COUNT(*) FILTER (WHERE e.data->>'answer' = 'yes')::int AS yes,
               COUNT(*) FILTER (WHERE e.data->>'answer' = 'no')::int AS no
        FROM events e
        WHERE {_FEEDBACK} AND e.created_at >= $2 AND e.created_at <= $3
        """,
        domain_id,
        start,
        end,
    )
    page_rows = await query(
        f"""
        SELECT e.url,
               COUNT(*) FILTER (WHERE e.data->>'answer' = 'yes')::int AS yes,
               COUNT(*) FILTER (WHERE e.data->>'answer' = 'no')::int AS no
        FROM events e
        WHERE {_FEEDBACK} AND e.created_at >= $2 AND e.created_at <= $3
        GROUP BY e.url
        """,
        domain_id,
        start,
        end,
    )
    recent = await query(
        f"""
        SELECT e.id, e.url, e.data, e.visitor_id, e.created_at
        FROM events e
        WHERE {_FEEDBACK} AND e.created_at >= $2 AND e.created_at <= $3
        ORDER BY e.created_at DESC
        LIMIT $4
        """,
        domain_id,
        start,
        end,
        RECENT_LIMIT,
    )
    yes = totals[0]["yes"] if totals else 0
    no = totals[0]["no"] if totals else 0
    return {
        "yes": yes,
        "no": no,
        "pages": by_page(page_rows),
        "answers": [
            {
                "id": row["id"],
                "answer": (row["data"] or {}).get("answer"),
                "comment": (row["data"] or {}).get("comment") or None,
                "question": (row["data"] or {}).get("question") or None,
                "path": url_path(row["url"]),
                "visitorId": row["visitor_id"],
                "at": row["created_at"],
            }
            for row in recent
        ],
    }


def by_page(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Answers per path (query strings merged), most answered first."""
    pages: dict[str, dict[str, int]] = {}
    for row in rows:
        counts = pages.setdefault(url_path(row["url"]), {"yes": 0, "no": 0})
        counts["yes"] += row["yes"]
        counts["no"] += row["no"]
    ordered = sorted(pages.items(), key=lambda item: -(item[1]["yes"] + item[1]["no"]))
    return [
        {
            "path": path,
            "yes": counts["yes"],
            "no": counts["no"],
            "percentYes": round(counts["yes"] / (counts["yes"] + counts["no"]) * 100),
        }
        for path, counts in ordered[:PAGES_LIMIT]
        if counts["yes"] + counts["no"]
    ]


def clean(data: dict[str, Any]) -> dict[str, Any]:
    """A feedback event's data as stored: a known answer and a bounded comment."""
    comment = data.get("comment")
    question = data.get("question")
    return {
        "event": "feedback",
        "answer": "yes" if data.get("answer") == "yes" else "no",
        **(
            {"comment": comment.strip()[:COMMENT_MAX_LENGTH]}
            if isinstance(comment, str) and comment.strip()
            else {}
        ),
        **({"question": question[:200]} if isinstance(question, str) and question else {}),
    }
