"""JS-compatible JSON serialization.

`JSON.stringify` and Python's `json.dumps` disagree on several things the
frontends can observe, and FastAPI's `jsonable_encoder` makes it worse by
coercing `Decimal` to `float`. This module makes the API emit JSON that is
byte-compatible with what the Express backend produced.

Use `jsjson(...)` in route handlers instead of returning a dict — it mirrors
`res.json(...)` and bypasses `jsonable_encoder` entirely.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from starlette.responses import Response

JSON_CONTENT_TYPE = "application/json; charset=utf-8"

_UNSET: Any = object()


def js_iso_datetime(value: datetime) -> str:
    """Format exactly like JS `Date.prototype.toISOString()`.

    Always UTC, always milliseconds (3 digits), always a `Z` suffix —
    e.g. `2026-09-17T13:22:57.123Z`. Python's `isoformat()` would instead emit
    microseconds and a `+00:00` offset.
    """
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    value = value.astimezone(UTC)
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def _utc_midnight(value: date) -> datetime:
    return datetime(value.year, value.month, value.day, tzinfo=UTC)


def _default(value: Any) -> Any:
    """Fallback encoder for types `json.dumps` cannot handle natively."""
    if isinstance(value, datetime):
        return js_iso_datetime(value)
    if isinstance(value, date):
        return js_iso_datetime(_utc_midnight(value))
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return bytes(value).decode("utf-8", "replace")
    if isinstance(value, (set, frozenset)):
        return list(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _js_number(value: Any) -> Any:
    """Match JS number formatting: an integral float prints without a decimal point.

    JS has a single number type, so `Math.abs(0)` serialises as `0`, whereas
    Python's `json.dumps` renders the float `0.0` as `0.0`. Handlers compute values
    such as `trend.strength` with float division, so without this the bytes differ
    even though the numbers are numerically equal.
    """
    if isinstance(value, float):
        if value.is_integer() and abs(value) < 1e21:
            return int(value)
        return value
    if isinstance(value, dict):
        return {key: _js_number(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_js_number(item) for item in value]
    return value


def js_json_dumps(content: Any) -> str:
    """Serialize with JS semantics.

    Compact separators match `JSON.stringify` (no spaces after `:` or `,`), and
    `ensure_ascii=False` matches its habit of emitting raw UTF-8.
    """
    return json.dumps(
        _js_number(content),
        default=_default,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def jsjson(
    content: Any = _UNSET,
    status_code: int = 200,
    headers: dict[str, str] | None = None,
) -> Response:
    """JSON response with JS-compatible serialization.

    Mirrors `res.json(...)`. Output is compact, `Decimal` stays a string (as
    node-postgres returns numeric), and datetimes use the JS ISO format.
    """
    if content is _UNSET:
        content = {}

    response = Response(
        content=js_json_dumps(content),
        status_code=status_code,
        media_type="application/json",
    )
    # Match Express, which always sends the charset.
    response.headers["content-type"] = JSON_CONTENT_TYPE
    for key, value in (headers or {}).items():
        response.headers[key] = value
    return response
