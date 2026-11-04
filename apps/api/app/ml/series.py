"""Daily series: one value per UTC day, missing days as zero."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date, timedelta
from typing import Any


def daily_values(
    rows: Iterable[Mapping[str, Any]], key: str, first: date, last: date, day_key: str = "bucket"
) -> list[float]:
    """`rows[key]` for each day from `first` to `last` inclusive.

    `rows[day_key]` is a date, or an ISO string starting with one
    ("2026-10-07T00:00:00Z", as `event_service.get_timeseries` returns).
    """
    by_day: dict[str, float] = {}
    for row in rows:
        day = row[day_key]
        day = day.isoformat() if isinstance(day, date) else str(day)
        by_day[day[:10]] = float(row.get(key) or 0)
    days = (last - first).days + 1
    return [by_day.get((first + timedelta(days=i)).isoformat(), 0.0) for i in range(max(days, 0))]


def trim_leading_zeros(values: list[float]) -> list[float]:
    """Drop the days before the first one with data (the site wasn't tracking yet)."""
    for i, value in enumerate(values):
        if value:
            return values[i:]
    return []
