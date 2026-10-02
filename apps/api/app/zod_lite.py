"""Minimal Zod-compatible validation.

The Express routes validate with Zod and return `error.errors[0].message`, or the
whole `error.errors` array. Rather than guess at Pydantic's wording, this module
builds Zod's own issue objects so both the first message and the full array line
up.

Only the checks the Express schemas actually use are implemented: string
(min/regex/url/email), enum, number (min/max), boolean, array (min/max) and
optional/default handling. Unsupported checks should fail loudly rather than
silently pass.
"""

from __future__ import annotations

import re
from typing import Any

# JS `typeof` names, used in Zod's invalid_type messages
UNDEFINED = "undefined"


def js_type_of(value: Any) -> str:
    """Zod's `getParsedType`: note an array reports `array`, not `object`."""
    if value is None:
        return UNDEFINED  # JSON has no undefined; a missing key is the analogue
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, (list, tuple)):
        return "array"
    return "object"


# ── Issue builders (field order follows Zod v3) ───────────────────────────────


def issue_invalid_type(field: str, expected: str, received: str) -> dict[str, Any]:
    message = (
        "Required"
        if received == UNDEFINED
        else f"Expected {expected}, received {received}"
    )
    return {
        "code": "invalid_type",
        "expected": expected,
        "received": received,
        "path": [field],
        "message": message,
    }


def issue_too_small(
    field: str, minimum: int, type_: str, message: str
) -> dict[str, Any]:
    return {
        "code": "too_small",
        "minimum": minimum,
        "type": type_,
        "inclusive": True,
        "exact": False,
        "message": message,
        "path": [field],
    }


def issue_too_big(field: str, maximum: int, type_: str, message: str) -> dict[str, Any]:
    return {
        "code": "too_big",
        "maximum": maximum,
        "type": type_,
        "inclusive": True,
        "exact": False,
        "message": message,
        "path": [field],
    }


def issue_invalid_string(field: str, validation: str, message: str) -> dict[str, Any]:
    return {
        "validation": validation,
        "code": "invalid_string",
        "message": message,
        "path": [field],
    }


def issue_invalid_enum(
    field: str, options: tuple[str, ...], received: Any
) -> dict[str, Any]:
    """NOTE the key order: Zod's enum branch spreads `received` first, so the
    serialized object starts with it rather than with `code`."""
    rendered = " | ".join(f"'{option}'" for option in options)
    shown = f"'{received}'" if isinstance(received, str) else received
    return {
        "received": received,
        "code": "invalid_enum_value",
        "options": list(options),
        "path": [field],
        "message": f"Invalid enum value. Expected {rendered}, received {shown}",
    }


def issue_invalid_literal(field: str, expected: Any) -> dict[str, Any]:
    return {
        "received": None,
        "code": "invalid_literal",
        "expected": expected,
        "path": [field],
        "message": f"Invalid literal value, expected {expected}",
    }


# ── Field validators ─────────────────────────────────────────────────────────
# Each returns `(value, issue)` where exactly one is meaningful: a None issue
# means the value passed. `value` is the coerced/defaulted value when it passed.


def string_field(
    body: dict[str, Any],
    field: str,
    *,
    required: bool = True,
    default: Any = None,
    min_length: int | None = None,
    min_message: str | None = None,
    pattern: str | None = None,
    pattern_message: str | None = None,
    is_url: bool = False,
    url_message: str | None = None,
    is_email: bool = False,
    email_message: str | None = None,
) -> tuple[Any, dict | None]:
    raw = body.get(field)

    if raw is None:
        if required:
            return None, issue_invalid_type(field, "string", UNDEFINED)
        return default, None

    if not isinstance(raw, str):
        return None, issue_invalid_type(field, "string", js_type_of(raw))

    if min_length is not None and len(raw) < min_length:
        message = min_message or f"String must contain at least {min_length} character(s)"
        return None, issue_too_small(field, min_length, "string", message)

    if pattern is not None and not re.match(pattern, raw, re.DOTALL):
        # Zod's regex check is whole-string; `re.match` anchors at the start, and
        # every schema here supplies both ends, so no extra anchoring is needed.
        if not re.search(r"(?:^|[^\\])\$$", pattern):
            raise ValueError(f"pattern for {field!r} is not end-anchored: {pattern}")
        return None, issue_invalid_string(field, "regex", pattern_message or "Invalid")

    if is_url and not _is_valid_url(raw):
        return None, issue_invalid_string(field, "url", url_message or "Invalid url")

    if is_email and not _EMAIL_RE.match(raw):
        return None, issue_invalid_string(field, "email", email_message or "Invalid email")

    return raw, None


def enum_field(
    body: dict[str, Any],
    field: str,
    options: tuple[str, ...],
    *,
    required: bool = True,
    default: Any = None,
) -> tuple[Any, dict | None]:
    raw = body.get(field)

    if raw is None:
        if required:
            return None, issue_invalid_type(field, "string", UNDEFINED)
        return default, None

    if not isinstance(raw, str):
        return None, issue_invalid_type(field, "string", js_type_of(raw))

    if raw not in options:
        return None, issue_invalid_enum(field, options, raw)

    return raw, None


def number_field(
    body: dict[str, Any],
    field: str,
    *,
    required: bool = True,
    default: Any = None,
    minimum: float | None = None,
    maximum: float | None = None,
    min_message: str | None = None,
    max_message: str | None = None,
) -> tuple[Any, dict | None]:
    raw = body.get(field)

    if raw is None:
        if required:
            return None, issue_invalid_type(field, "number", UNDEFINED)
        return default, None

    # `typeof NaN === 'number'` in JS, but JSON cannot carry NaN, so anything not
    # a real number is an invalid_type here.
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        return None, issue_invalid_type(field, "number", js_type_of(raw))

    if minimum is not None and raw < minimum:
        message = min_message or f"Number must be greater than or equal to {minimum}"
        return None, issue_too_small(field, int(minimum), "number", message)

    if maximum is not None and raw > maximum:
        message = max_message or f"Number must be less than or equal to {maximum}"
        return None, issue_too_big(field, int(maximum), "number", message)

    return raw, None


# These three are copied verbatim from the installed Zod (v3.25.76,
# `node_modules/zod/v3/types.js`) rather than approximated. The email pattern in
# particular is stricter than the usual "something@something.something": the TLD
# must be at least two *letters*, so `a@b.c0m` is rejected by Express.
_EMAIL_RE = re.compile(
    r"^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$",
    re.IGNORECASE,
)

ZOD_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$"
)

# `z.string().datetime()` with no options: a leap-year-aware date, an optional
# seconds part, and a mandatory trailing `Z` (offsets are off by default).
_ZOD_DATE_SOURCE = (
    r"((\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29"
    r"|\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\d|3[01])"
    r"|(0[469]|11)-(0[1-9]|[12]\d|30)"
    r"|(02)-(0[1-9]|1\d|2[0-8])))"
)
_ZOD_TIME_SOURCE = r"([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?"
ZOD_DATETIME_RE = re.compile(rf"^{_ZOD_DATE_SOURCE}T{_ZOD_TIME_SOURCE}Z$")


def _is_valid_url(value: str) -> bool:
    """Approximate Zod's `.url()`, which uses `new URL()` and accepts any scheme."""
    return bool(re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://\S+$", value))


# ── Issue builders specific to the admin validators ───────────────────────────


def issue_invalid_integer(field: str, received: str) -> dict[str, Any]:
    """`z.number().int()` rejection.

    Note the key order: `message` comes BEFORE `path` here, unlike every other
    `invalid_type` issue. Verified against zod 3.25.76 — not a typo.
    """
    return {
        "code": "invalid_type",
        "expected": "integer",
        "received": received,
        "message": f"Expected integer, received {received}",
        "path": [field],
    }


def issue_custom(message: str) -> dict[str, Any]:
    """A `.refine()` failure. Note the empty `path`."""
    return {"code": "custom", "message": message, "path": []}


def issue_invalid_union(
    field: str, variants: list[tuple[str, str]]
) -> dict[str, Any]:
    """A `z.union` failure.

    Zod tries each member in order and reports all of them via `unionErrors`,
    each entry being a serialized `ZodError`. `variants` is a list of
    `(expected_type, received_type)` pairs in declaration order.
    """
    return {
        "code": "invalid_union",
        "unionErrors": [
            {
                "issues": [issue_invalid_type(field, expected, received)],
                "name": "ZodError",
            }
            for expected, received in variants
        ],
        "path": [field],
        "message": "Invalid input",
    }


def received_type(body: dict[str, Any], field: str) -> str:
    """The `received` string to report for a missing / null field.

    `js_type_of` maps `None` to `undefined`, which is right for a field that is
    simply absent. Zod distinguishes the two, though: `.optional()` accepts
    `undefined` but rejects an explicit `null` with `received: "null"`, and only
    `.nullable()` accepts `null`. So presence has to be checked first.
    """
    if field not in body or body[field] is None:
        return UNDEFINED if field not in body else "null"
    return js_type_of(body[field])


def first_message(issues: list[dict[str, Any]]) -> str:
    return issues[0]["message"] if issues else ""
