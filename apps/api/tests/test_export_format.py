"""CSV export cell formatting — timestamps must be something spreadsheets parse.

Express wrote `Date.toString()` (`Wed Oct 07 2026 16:05:25 GMT+0000 (Coordinated
Universal Time)`), which Excel and Sheets keep as text, so the column could not be
sorted or filtered by date. Both exports now write ISO 8601 UTC.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

from app.routers import export


def test_timestamps_are_iso_8601_utc():
    value = datetime(2026, 10, 7, 16, 5, 25, 123456, tzinfo=UTC)

    assert export._js_str(value) == "2026-10-07T16:05:25.123Z"


def test_offset_timestamps_are_normalised_to_utc():
    lagos = timezone(timedelta(hours=1))
    value = datetime(2026, 10, 7, 17, 5, 25, tzinfo=lagos)

    assert export._js_str(value) == "2026-10-07T16:05:25.000Z"


def test_empty_cells_still_use_iso_for_dates():
    value = datetime(2026, 10, 7, 16, 5, 25, tzinfo=UTC)

    assert export._js_or_empty(value) == "2026-10-07T16:05:25.000Z"
    assert export._js_or_empty(None) == ""
