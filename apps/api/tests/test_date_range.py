"""The dashboard date range shared by funnels, heatmaps and recordings."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.date_range import date_range, parse_date
from app.errors import SimpleError


def test_parse_date_reads_iso_timestamps_and_plain_dates_as_utc():
    assert parse_date("2026-10-01T12:00:00.000Z") == datetime(2026, 10, 1, 12, tzinfo=UTC)
    assert parse_date("2026-10-01") == datetime(2026, 10, 1, tzinfo=UTC)
    assert parse_date("") is None
    assert parse_date(None) is None


def test_parse_date_rejects_garbage():
    with pytest.raises(SimpleError):
        parse_date("last tuesday")


def test_date_range_defaults_to_the_lookback_window():
    start, end = date_range(None, None, 30)
    assert end - start == timedelta(days=30)
    assert abs((datetime.now(UTC) - end).total_seconds()) < 5


def test_date_range_uses_the_given_bounds_and_refuses_them_reversed():
    assert date_range("2026-09-01", "2026-09-08", 30) == (
        datetime(2026, 9, 1, tzinfo=UTC),
        datetime(2026, 9, 8, tzinfo=UTC),
    )
    with pytest.raises(SimpleError):
        date_range("2026-09-08", "2026-09-01", 30)
