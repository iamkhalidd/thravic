"""The dashboard's date range (`startDate` / `endDate` query parameters).

Used by the routes that once measured a fixed window whatever the date picker
said (funnels, heatmaps, recordings). Values are ISO dates or timestamps; a date
without a time is UTC midnight, and one without an offset is UTC.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from .errors import SimpleError


def parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        raise SimpleError(f"Invalid date: {value}", 400) from None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def date_range(
    start: str | None, end: str | None, default_days: int
) -> tuple[datetime, datetime]:
    """(start, end); without them, the `default_days` days up to now."""
    end_date = parse_date(end) or datetime.now(UTC)
    start_date = parse_date(start) or end_date - timedelta(days=default_days)
    if start_date > end_date:
        raise SimpleError("startDate must be before endDate", 400)
    return start_date, end_date
