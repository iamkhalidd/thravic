"""JS-semantics helpers.

Small behavioural differences between JavaScript and Python that are observable in
API responses. Each one is called out because getting it wrong produces a
plausible-looking but different number or string.
"""

from __future__ import annotations

import math
import re
from datetime import UTC, datetime
from urllib.parse import urlparse


def js_parse_int(value: str) -> int:
    """`parseInt(value)` — leading sign, then digits, ignoring trailing junk.

    `parseInt('7abc')` is 7, `parseInt('abc')` is NaN, and callers usually write
    `parseInt(x) || default`, so NaN and 0 both collapse to the default.
    """
    match = re.match(r"^[+-]?\d+", value.strip())
    if not match:
        return 0
    try:
        return int(match.group(0))
    except ValueError:
        return 0


def js_parse_int_or_nan(value: str) -> float:
    """`parseInt(value)` but preserving NaN instead of collapsing it to 0.

    Several list endpoints interpolate the parsed value straight into SQL as
    `LIMIT $n` / `OFFSET $n` without a fallback, so `?limit=abc` yields `NaN`,
    Postgres rejects it, and Express answers 500. Returning 0 here would instead
    serve an empty page — quietly different, and wrong. `float("nan")` reaches
    asyncpg as a `DataError`, which the route's own handler turns into the same 500.
    """
    match = re.match(r"^[+-]?\d+", value.strip())
    if not match:
        return float("nan")
    try:
        return int(match.group(0))
    except ValueError:
        return float("nan")


def js_round(value: float) -> int:
    """`Math.round()` — half rounds toward +Infinity.

    Python's built-in `round()` uses banker's rounding, so `round(0.5)` is 0 while
    `Math.round(0.5)` is 1. Percentages and durations are computed with this.
    """
    if math.isnan(value) or math.isinf(value):
        return 0
    return math.floor(value + 0.5)


def url_path(raw: str) -> str:
    """`new URL(raw).pathname`, falling back to the raw value.

    `new URL('/pricing')` throws because there is no base, and the Express routes
    catch that and keep the original string. A naive `urlparse` would happily return
    `/pricing`, which is the same result here but diverges for other malformed
    inputs, so the absolute-URL requirement is enforced explicitly.
    """
    try:
        parsed = urlparse(raw)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError("not an absolute URL")
        return parsed.path or "/"
    except Exception:
        return raw


_WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
_MONTHS = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)


def js_date_to_string(value: datetime) -> str:
    """`Date.prototype.toString()`.

    Reached through `Array.prototype.join(",")`, which stringifies each element —
    so a Date column lands in a CSV cell as `Wed Sep 17 2026 00:00:00 GMT+0000
    (Coordinated Universal Time)`. The day is **not** zero-padded, and V8 uses the
    long timezone name for UTC. Assumes the server runs in UTC, which is what the
    deployed Node process does; a non-UTC TZ would change this output.
    """
    utc = value.astimezone(UTC)
    weekday = _WEEKDAYS[utc.weekday()]
    month = _MONTHS[utc.month - 1]
    # V8 zero-pads the day ("Sep 07"), unlike the month name or the year.
    return (
        f"{weekday} {month} {utc.day:02d} {utc.year} "
        f"{utc.hour:02d}:{utc.minute:02d}:{utc.second:02d} "
        "GMT+0000 (Coordinated Universal Time)"
    )


def js_to_locale_string(value: float) -> str:
    """`Number.prototype.toLocaleString()` with no locale argument.

    Node resolves the default locale through ICU, which is `en-US` when LANG is
    unset (the case on Render), giving thousands separators and at most three
    fraction digits: `45000` -> `"45,000"`, `45000.4567` -> `"45,000.457"`.

    NOTE: this is the one response value that depends on the *host* locale rather
    than on the data. If the Node process ever ran with a different LANG the
    original output would change too, so matching en-US is the best available
    target rather than a guarantee.
    """
    if math.isnan(value) or math.isinf(value):
        return "NaN" if math.isnan(value) else ("Infinity" if value > 0 else "-Infinity")

    negative = value < 0
    # JS rounds half away from zero here, and caps at 3 fraction digits.
    quantised = round(abs(value) * 1000)
    whole, frac = divmod(quantised, 1000)

    whole_text = f"{whole:,}"
    if frac:
        frac_text = f"{frac:03d}".rstrip("0")
        text = f"{whole_text}.{frac_text}"
    else:
        text = whole_text

    return f"-{text}" if negative else text
