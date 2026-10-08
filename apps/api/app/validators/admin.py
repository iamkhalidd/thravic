"""Admin schemas — port of `validators/admin.ts`, plus the schemas that
`routes/admin/plans.ts` and `routes/admin/promos.ts` declare inline.

Every shape here was verified against the installed validator (zod 3.25.76)
rather than guessed. Three behaviours matter for response parity:

* `z.object()` reports **every** failing field, and a field with several checks
  reports **each** of them. `-1.5` against `z.number().int().min(0)` produces the
  integer issue *and* `too_small`; a 1-char uppercase id produces `too_small`
  *and* the regex issue.
* `.optional()` accepts a missing key but **rejects an explicit `null`** with
  `received: "null"`; only `.nullable()` accepts null. Hence `received_type`.
* A `.refine()` only runs once the object itself parsed, and reports
  `{code: "custom", message, path: []}`.

Each `*_schema` returns `(data, issues)`. `data` mirrors what `safeParse` would
put in `result.data`, so a caller can use `"field" in data` to decide whether the
key was supplied at all — which several admin UPDATEs depend on.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ..zod_lite import (
    _EMAIL_RE,
    UNDEFINED,
    ZOD_DATETIME_RE,
    ZOD_UUID_RE,
    issue_custom,
    issue_invalid_enum,
    issue_invalid_integer,
    issue_invalid_string,
    issue_invalid_type,
    issue_invalid_union,
    issue_too_big,
    issue_too_small,
    js_type_of,
    received_type,
)

# Distinguishes "the key is absent from the parsed output" from "the value is null".
_OMIT: Any = object()

_STRING_VARIANTS = ("string", "number", "boolean")


# ── Field primitives ─────────────────────────────────────────────────────────


def _string(
    body: dict[str, Any],
    field: str,
    issues: list[dict],
    *,
    required: bool = True,
    nullable: bool = False,
    default: Any = _OMIT,
    min_len: int | None = None,
    min_msg: str | None = None,
    max_len: int | None = None,
    max_msg: str | None = None,
    pattern: str | None = None,
    pattern_msg: str | None = None,
    is_email: bool = False,
    email_msg: str | None = None,
    is_uuid: bool = False,
    uuid_msg: str | None = None,
    is_datetime: bool = False,
    datetime_msg: str | None = None,
    transform: Callable[[str], str] | None = None,
) -> Any:
    """`z.string()` with the given checks, accumulating every failure."""
    if field not in body:
        if required:
            issues.append(issue_invalid_type(field, "string", UNDEFINED))
            return _OMIT
        return default

    raw = body[field]

    if raw is None:
        if nullable:
            return None
        # `.optional()` does NOT imply `.nullable()`.
        issues.append(issue_invalid_type(field, "string", "null"))
        return _OMIT

    if not isinstance(raw, str):
        issues.append(issue_invalid_type(field, "string", js_type_of(raw)))
        return _OMIT

    before = len(issues)

    if min_len is not None and len(raw) < min_len:
        issues.append(
            issue_too_small(
                field,
                min_len,
                "string",
                min_msg or f"String must contain at least {min_len} character(s)",
            )
        )
    if max_len is not None and len(raw) > max_len:
        issues.append(
            issue_too_big(
                field,
                max_len,
                "string",
                max_msg or f"String must contain at most {max_len} character(s)",
            )
        )
    if pattern is not None and not _compile(pattern).match(raw):
        issues.append(issue_invalid_string(field, "regex", pattern_msg or "Invalid"))
    if is_email and not _EMAIL_RE.match(raw):
        issues.append(issue_invalid_string(field, "email", email_msg or "Invalid email"))
    if is_uuid and not ZOD_UUID_RE.match(raw):
        issues.append(issue_invalid_string(field, "uuid", uuid_msg or "Invalid uuid"))
    if is_datetime and not ZOD_DATETIME_RE.match(raw):
        issues.append(issue_invalid_string(field, "datetime", datetime_msg or "Invalid datetime"))

    if len(issues) > before:
        return _OMIT

    return transform(raw) if transform else raw


def _int(
    body: dict[str, Any],
    field: str,
    issues: list[dict],
    *,
    required: bool = True,
    nullable: bool = False,
    default: Any = _OMIT,
    minimum: int | None = None,
    maximum: int | None = None,
    min_msg: str | None = None,
    max_msg: str | None = None,
) -> Any:
    """`z.number().int()` with optional bounds.

    The integer check does not short-circuit the bound checks, so a
    non-integral value outside the range reports both issues.
    """
    if field not in body:
        if required:
            issues.append(issue_invalid_type(field, "number", UNDEFINED))
            return _OMIT
        return default

    raw = body[field]

    if raw is None:
        if nullable:
            return None
        issues.append(issue_invalid_type(field, "number", "null"))
        return _OMIT

    before = len(issues)

    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        issues.append(issue_invalid_type(field, "number", js_type_of(raw)))
        return _OMIT

    if isinstance(raw, float) and not raw.is_integer():
        issues.append(issue_invalid_integer(field, "float"))

    if minimum is not None and raw < minimum:
        issues.append(
            issue_too_small(
                field,
                minimum,
                "number",
                min_msg or f"Number must be greater than or equal to {minimum}",
            )
        )
    if maximum is not None and raw > maximum:
        issues.append(
            issue_too_big(
                field,
                maximum,
                "number",
                max_msg or f"Number must be less than or equal to {maximum}",
            )
        )

    if len(issues) > before:
        return _OMIT

    # JS has a single number type, so an integral float is emitted as an integer.
    return int(raw)


def _boolean(
    body: dict[str, Any],
    field: str,
    issues: list[dict],
    *,
    default: Any = _OMIT,
) -> Any:
    if field not in body:
        return default
    raw = body[field]
    if not isinstance(raw, bool):
        issues.append(issue_invalid_type(field, "boolean", js_type_of(raw)))
        return _OMIT
    return raw


def _enum(
    body: dict[str, Any],
    field: str,
    options: tuple[str, ...],
    issues: list[dict],
    *,
    required: bool = True,
    default: Any = _OMIT,
) -> Any:
    if field not in body:
        if required:
            issues.append(issue_invalid_type(field, "string", UNDEFINED))
            return _OMIT
        return default
    raw = body[field]
    if not isinstance(raw, str):
        issues.append(issue_invalid_type(field, "string", js_type_of(raw)))
        return _OMIT
    if raw not in options:
        issues.append(issue_invalid_enum(field, options, raw))
        return _OMIT
    return raw


def _string_array(
    body: dict[str, Any],
    field: str,
    issues: list[dict],
    *,
    default: Any = _OMIT,
) -> Any:
    """`z.array(z.string())` — every bad element is reported, not just the first."""
    if field not in body:
        return default

    raw = body[field]
    if not isinstance(raw, list):
        issues.append(issue_invalid_type(field, "array", js_type_of(raw)))
        return _OMIT

    ok = True
    for index, item in enumerate(raw):
        if not isinstance(item, str):
            ok = False
            issues.append(
                {
                    **issue_invalid_type(field, "string", js_type_of(item)),
                    "path": [field, index],
                }
            )

    return raw if ok else _OMIT


def _scalar_union(body: dict[str, Any], field: str, issues: list[dict]) -> Any:
    """`z.union([z.string(), z.number(), z.boolean()])` — the settings `value`."""
    received = received_type(body, field)

    if received in _STRING_VARIANTS:
        return body[field]

    issues.append(issue_invalid_union(field, [(name, received) for name in _STRING_VARIANTS]))
    return _OMIT


# ── Schemas ──────────────────────────────────────────────────────────────────

USER_ROLES = ("user", "admin", "super_admin")
CURRENCIES = ("NGN", "USD", "GBP", "EUR")
INTERVALS = ("monthly", "yearly")
SUB_STATUSES = ("active", "canceled", "past_due")
EVENT_TYPES = ("pageview", "click", "scroll", "form", "custom")
DISCOUNT_TYPES = ("percentage", "flat")

_PLAN_ID_PATTERN = r"^[a-z0-9_]+$"


def update_user_schema(body: dict[str, Any]) -> tuple[dict, list[dict]]:
    issues: list[dict] = []
    data: dict[str, Any] = {}

    value = _string(body, "name", issues, required=False, min_len=2, max_len=100)
    if value is not _OMIT:
        data["name"] = value

    value = _string(body, "email", issues, required=False, is_email=True)
    if value is not _OMIT:
        data["email"] = value

    # Any plan id; the handler checks the plan exists (admins create plans).
    value = _string(
        body,
        "subscription",
        issues,
        required=False,
        max_len=50,
        pattern=_PLAN_ID_PATTERN,
        pattern_msg="Unknown plan",
    )
    if value is not _OMIT:
        data["subscription"] = value

    value = _enum(body, "role", USER_ROLES, issues, required=False)
    if value is not _OMIT:
        data["role"] = value

    return data, issues


def admin_reset_password_schema(body: dict[str, Any]) -> tuple[dict, list[dict]]:
    issues: list[dict] = []
    data: dict[str, Any] = {}

    value = _string(
        body,
        "newPassword",
        issues,
        min_len=8,
        min_msg="Password must be at least 8 characters",
        max_len=128,
        max_msg="Password too long",
    )
    if value is not _OMIT:
        data["newPassword"] = value

    return data, issues


def update_admin_domain_schema(body: dict[str, Any]) -> tuple[dict, list[dict]]:
    issues: list[dict] = []
    data: dict[str, Any] = {}

    value = _string(body, "name", issues, required=False, min_len=1, max_len=200)
    if value is not _OMIT:
        data["name"] = value

    value = _boolean(body, "verified", issues)
    if value is not _OMIT:
        data["verified"] = value

    return data, issues


def transfer_domain_schema(body: dict[str, Any]) -> tuple[dict, list[dict]]:
    issues: list[dict] = []
    data: dict[str, Any] = {}

    value = _string(body, "newUserId", issues, is_uuid=True, uuid_msg="Invalid user ID")
    if value is not _OMIT:
        data["newUserId"] = value

    return data, issues


def update_subscription_schema(body: dict[str, Any]) -> tuple[dict, list[dict]]:
    issues: list[dict] = []
    data: dict[str, Any] = {}

    value = _string(
        body,
        "plan",
        issues,
        required=False,
        max_len=50,
        pattern=_PLAN_ID_PATTERN,
        pattern_msg="Unknown plan",
    )
    if value is not _OMIT:
        data["plan"] = value

    value = _enum(body, "status", SUB_STATUSES, issues, required=False)
    if value is not _OMIT:
        data["status"] = value

    for field in ("events_limit", "domains_limit"):
        value = _int(body, field, issues, required=False, minimum=-1)
        if value is not _OMIT:
            data[field] = value

    return data, issues


def purge_events_schema(body: dict[str, Any]) -> tuple[dict, list[dict]]:
    issues: list[dict] = []
    data: dict[str, Any] = {}

    value = _string(body, "domainId", issues, required=False, is_uuid=True)
    if value is not _OMIT:
        data["domainId"] = value

    value = _string(body, "before", issues, required=False)
    if value is not _OMIT:
        data["before"] = value

    value = _enum(body, "type", EVENT_TYPES, issues, required=False)
    if value is not _OMIT:
        data["type"] = value

    # `.refine()` runs only once the object parsed cleanly.
    if not issues and not (data.get("domainId") or data.get("before")):
        issues.append(issue_custom("Must specify domainId and/or before date"))

    return data, issues


def update_setting_schema(body: dict[str, Any]) -> tuple[dict, list[dict]]:
    issues: list[dict] = []
    data: dict[str, Any] = {}

    value = _scalar_union(body, "value", issues)
    if value is not _OMIT:
        data["value"] = value

    return data, issues


def update_retention_schema(body: dict[str, Any]) -> tuple[dict, list[dict]]:
    """Unused by the routes — `admin/retention.ts` reads `req.body` directly.

    Ported anyway so this module stays a faithful mirror of `validators/admin.ts`.
    """
    issues: list[dict] = []
    data: dict[str, Any] = {}

    value = _int(body, "days", issues, minimum=1, maximum=3650)
    if value is not _OMIT:
        data["days"] = value

    return data, issues


# ── Plans (declared inline in `routes/admin/plans.ts`) ───────────────────────

_PLAN_FIELDS = (
    "name",
    "price",
    "currency",
    "interval",
    "events_limit",
    "domains_limit",
    "retention_days",
    "features",
    "active",
    "sort_order",
)

_PLAN_LIMITS: dict[str, tuple[int | None, int | None]] = {
    "price": (0, None),
    "events_limit": (0, None),
    "domains_limit": (0, None),
    "retention_days": (1, 3650),
    "sort_order": (0, None),
}


# Features a plan can grant (the ids the feature gate checks).
PLAN_FEATURE_IDS = (
    "analytics",
    "realtime",
    "utm",
    "heatmaps",
    "recordings",
    "funnels",
    "insights",
    "export",
    "experiments",
    "webhooks",
    "team",
)
MAX_EXTRA_FEATURES = 8


def _plan_extras(
    body: dict[str, Any], issues: list[dict], data: dict[str, Any], *, create: bool
) -> None:
    """Limits added with the plan catalog and the pricing card's copy.

    `team_limit` / `recordings_per_day`: null means unlimited.
    """
    for field in ("team_limit", "recordings_per_day"):
        value = _int(
            body,
            field,
            issues,
            required=False,
            nullable=True,
            minimum=0,
            default=None if create else _OMIT,
        )
        if value is not _OMIT:
            data[field] = value

    value = _string(
        body, "tagline", issues, required=False, max_len=200, default="" if create else _OMIT
    )
    if value is not _OMIT:
        data["tagline"] = value

    value = _string(
        body, "badge", issues, required=False, max_len=40, default="" if create else _OMIT
    )
    if value is not _OMIT:
        data["badge"] = value

    value = _boolean(body, "show_on_landing", issues, default=True if create else _OMIT)
    if value is not _OMIT:
        data["show_on_landing"] = value

    value = _string_array(body, "extra_features", issues, default=[] if create else _OMIT)
    if value is not _OMIT:
        lines = [line.strip() for line in value if line.strip()]
        if len(lines) > MAX_EXTRA_FEATURES or any(len(line) > 80 for line in lines):
            issues.append(
                {
                    "path": ["extra_features"],
                    "message": f"Up to {MAX_EXTRA_FEATURES} extra lines of 80 characters",
                }
            )
        else:
            data["extra_features"] = lines

    if "features" in data:
        unknown = [f for f in data["features"] if f not in PLAN_FEATURE_IDS]
        if unknown:
            issues.append({"path": ["features"], "message": f"Unknown feature: {unknown[0]}"})


def create_plan_schema(body: dict[str, Any]) -> tuple[dict, list[dict]]:
    """`createPlanSchema` — the fields with no `.default()` are required.

    Issue order follows field declaration order, which is what the client sees.
    """
    issues: list[dict] = []
    data: dict[str, Any] = {}

    value = _string(
        body,
        "id",
        issues,
        min_len=2,
        max_len=50,
        pattern=_PLAN_ID_PATTERN,
        pattern_msg="Plan ID must be lowercase alphanumeric",
    )
    if value is not _OMIT:
        data["id"] = value

    value = _string(body, "name", issues, min_len=1, max_len=100)
    if value is not _OMIT:
        data["name"] = value

    value = _int(body, "price", issues, minimum=0)
    if value is not _OMIT:
        data["price"] = value

    value = _enum(body, "currency", CURRENCIES, issues, required=False, default="NGN")
    if value is not _OMIT:
        data["currency"] = value

    value = _enum(body, "interval", INTERVALS, issues, required=False, default="monthly")
    if value is not _OMIT:
        data["interval"] = value

    value = _int(body, "events_limit", issues, minimum=0)
    if value is not _OMIT:
        data["events_limit"] = value

    value = _int(body, "domains_limit", issues, minimum=0)
    if value is not _OMIT:
        data["domains_limit"] = value

    value = _int(
        body, "retention_days", issues, required=False, minimum=1, maximum=3650, default=30
    )
    if value is not _OMIT:
        data["retention_days"] = value

    value = _string_array(body, "features", issues, default=[])
    if value is not _OMIT:
        data["features"] = value

    value = _boolean(body, "active", issues, default=True)
    if value is not _OMIT:
        data["active"] = value

    value = _int(body, "sort_order", issues, required=False, minimum=0, default=0)
    if value is not _OMIT:
        data["sort_order"] = value

    _plan_extras(body, issues, data, create=True)
    return data, issues


def update_plan_schema(body: dict[str, Any]) -> tuple[dict, list[dict]]:
    """`updatePlanSchema` — every field is optional, so `{}` parses to `{}`."""
    issues: list[dict] = []
    data: dict[str, Any] = {}

    value = _string(body, "name", issues, required=False, min_len=1, max_len=100)
    if value is not _OMIT:
        data["name"] = value

    for field, (minimum, maximum) in _PLAN_LIMITS.items():
        value = _int(body, field, issues, required=False, minimum=minimum, maximum=maximum)
        if value is not _OMIT:
            data[field] = value

    value = _enum(body, "currency", CURRENCIES, issues, required=False)
    if value is not _OMIT:
        data["currency"] = value

    value = _enum(body, "interval", INTERVALS, issues, required=False)
    if value is not _OMIT:
        data["interval"] = value

    value = _string_array(body, "features", issues)
    if value is not _OMIT:
        data["features"] = value

    value = _boolean(body, "active", issues)
    if value is not _OMIT:
        data["active"] = value

    _plan_extras(body, issues, data, create=False)
    return data, issues


# ── Promos (declared inline in `routes/admin/promos.ts`) ─────────────────────


def _promo_code(value: str) -> str:
    return value.upper().strip()


def create_promo_schema(body: dict[str, Any]) -> tuple[dict, list[dict]]:
    issues: list[dict] = []
    data: dict[str, Any] = {}

    value = _string(body, "code", issues, min_len=4, max_len=50, transform=_promo_code)
    if value is not _OMIT:
        data["code"] = value

    value = _enum(body, "discount_type", DISCOUNT_TYPES, issues)
    if value is not _OMIT:
        data["discount_type"] = value

    value = _int(body, "discount_value", issues, minimum=1)
    if value is not _OMIT:
        data["discount_value"] = value

    value = _string_array(body, "applicable_plans", issues, default=[])
    if value is not _OMIT:
        data["applicable_plans"] = value

    value = _int(body, "max_uses", issues, required=False, nullable=True, minimum=1)
    if value is not _OMIT:
        data["max_uses"] = value

    value = _int(body, "max_per_user", issues, required=False, default=1, minimum=1)
    if value is not _OMIT:
        data["max_per_user"] = value

    for field in ("starts_at", "expires_at"):
        value = _string(body, field, issues, required=False, nullable=True, is_datetime=True)
        if value is not _OMIT:
            data[field] = value

    value = _boolean(body, "active", issues, default=True)
    if value is not _OMIT:
        data["active"] = value

    # `.refine()` runs only once the object parsed cleanly.
    if not issues:
        if data.get("discount_type") == "percentage" and data.get("discount_value", 0) > 100:
            issues.append(issue_custom("Percentage discount cannot exceed 100%"))

    return data, issues


def update_promo_schema(body: dict[str, Any]) -> tuple[dict, list[dict]]:
    issues: list[dict] = []
    data: dict[str, Any] = {}

    value = _string(
        body, "code", issues, required=False, min_len=4, max_len=50, transform=_promo_code
    )
    if value is not _OMIT:
        data["code"] = value

    value = _enum(body, "discount_type", DISCOUNT_TYPES, issues, required=False)
    if value is not _OMIT:
        data["discount_type"] = value

    value = _int(body, "discount_value", issues, required=False, minimum=1)
    if value is not _OMIT:
        data["discount_value"] = value

    value = _string_array(body, "applicable_plans", issues)
    if value is not _OMIT:
        data["applicable_plans"] = value

    value = _int(body, "max_uses", issues, required=False, nullable=True, minimum=1)
    if value is not _OMIT:
        data["max_uses"] = value

    value = _int(body, "max_per_user", issues, required=False, minimum=1)
    if value is not _OMIT:
        data["max_per_user"] = value

    for field in ("starts_at", "expires_at"):
        value = _string(body, field, issues, required=False, nullable=True, is_datetime=True)
        if value is not _OMIT:
            data[field] = value

    value = _boolean(body, "active", issues)
    if value is not _OMIT:
        data["active"] = value

    return data, issues


# ── Helpers ──────────────────────────────────────────────────────────────────

_PATTERN_CACHE: dict[str, Any] = {}


def _compile(pattern: str):
    import re

    compiled = _PATTERN_CACHE.get(pattern)
    if compiled is None:
        compiled = re.compile(pattern)
        _PATTERN_CACHE[pattern] = compiled
    return compiled
