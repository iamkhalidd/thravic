"""Serialization tests — the JS-compatibility contract the frontends depend on."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from app.json_response import js_iso_datetime, js_json_dumps


def test_datetime_matches_js_toisostring():
    value = datetime(2026, 9, 17, 13, 22, 57, 123456, tzinfo=UTC)
    assert js_iso_datetime(value) == "2026-09-17T13:22:57.123Z"


def test_datetime_truncates_microseconds_to_milliseconds():
    value = datetime(2026, 9, 17, 13, 22, 57, 999_999, tzinfo=UTC)
    assert js_iso_datetime(value) == "2026-09-17T13:22:57.999Z"


def test_naive_datetime_is_treated_as_utc():
    # Postgres TIMESTAMPTZ always returns aware datetimes, but be explicit.
    assert js_json_dumps({"t": datetime(2026, 1, 2, 3, 4, 5)}) == (
        '{"t":"2026-01-02T03:04:05.000Z"}'
    )


def test_date_serializes_as_utc_midnight():
    # node-postgres parses DATE into a JS Date, which on a UTC host is midnight UTC
    assert js_json_dumps({"d": date(2026, 9, 17)}) == '{"d":"2026-09-17T00:00:00.000Z"}'


def test_decimal_stays_a_string_like_node_postgres():
    assert js_json_dumps({"n": Decimal("123.45")}) == '{"n":"123.45"}'


def test_uuid_serializes_as_string():
    value = UUID("00000000-0000-0000-0000-0000000000ff")
    assert js_json_dumps({"id": value}) == '{"id":"00000000-0000-0000-0000-0000000000ff"}'


def test_output_is_compact_like_json_stringify():
    # JSON.stringify emits no spaces after ':' or ','
    assert js_json_dumps({"a": 1, "b": [1, 2]}) == '{"a":1,"b":[1,2]}'


def test_unicode_is_not_escaped():
    # JSON.stringify emits raw UTF-8
    assert js_json_dumps({"s": "café"}) == '{"s":"café"}'


def test_null_is_preserved():
    assert js_json_dumps(None) == "null"
