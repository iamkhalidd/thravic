"""Admin validator parity — locks the Zod `issues` output byte-for-byte.

Every expected value in this file was captured by running the *real* validators
under Node (`zod` 3.25.76) and serialising `error.issues`. These cases are hard
to reach over HTTP — they need a body the parity specs would otherwise have to
encode as an odd combination of fields — so they are asserted directly here.

If one of these fails, the fix is to make the Python side match Zod, never the
other way round: the frontends render these messages verbatim.
"""

from __future__ import annotations

import pytest

from app.validators import admin as v


def issues_of(result: tuple[dict, list[dict]]) -> list[dict]:
    return result[1]


# ── updateUserSchema ─────────────────────────────────────────────────────────


def test_update_user_name_too_short():
    assert issues_of(v.update_user_schema({"name": "a"})) == [
        {
            "code": "too_small",
            "minimum": 2,
            "type": "string",
            "inclusive": True,
            "exact": False,
            "message": "String must contain at least 2 character(s)",
            "path": ["name"],
        }
    ]


def test_update_user_name_too_long():
    assert issues_of(v.update_user_schema({"name": "x" * 101})) == [
        {
            "code": "too_big",
            "maximum": 100,
            "type": "string",
            "inclusive": True,
            "exact": False,
            "message": "String must contain at most 100 character(s)",
            "path": ["name"],
        }
    ]


def test_update_user_email_is_reported_before_the_enum_fields():
    body = {"name": "a", "email": "x", "subscription": "gold", "role": "root"}
    assert issues_of(v.update_user_schema(body)) == [
        {
            "code": "too_small",
            "minimum": 2,
            "type": "string",
            "inclusive": True,
            "exact": False,
            "message": "String must contain at least 2 character(s)",
            "path": ["name"],
        },
        {
            "validation": "email",
            "code": "invalid_string",
            "message": "Invalid email",
            "path": ["email"],
        },
        {
            "received": "gold",
            "code": "invalid_enum_value",
            "options": ["free", "pro", "agency"],
            "path": ["subscription"],
            "message": (
                "Invalid enum value. Expected 'free' | 'pro' | 'agency', "
                "received 'gold'"
            ),
        },
        {
            "received": "root",
            "code": "invalid_enum_value",
            "options": ["user", "admin", "super_admin"],
            "path": ["role"],
            "message": (
                "Invalid enum value. Expected 'user' | 'admin' | 'super_admin', "
                "received 'root'"
            ),
        },
    ]


def test_update_user_empty_body_parses_to_empty_object():
    data, issues = v.update_user_schema({})
    assert (data, issues) == ({}, [])


def test_optional_field_rejects_explicit_null_as_null_not_undefined():
    """`.optional()` accepts a missing key but not a present `null`."""
    assert issues_of(v.update_user_schema({"name": None})) == [
        {
            "code": "invalid_type",
            "expected": "string",
            "received": "null",
            "path": ["name"],
            "message": "Expected string, received null",
        }
    ]


# ── adminResetPasswordSchema ─────────────────────────────────────────────────


def test_reset_password_uses_the_custom_messages():
    assert issues_of(v.admin_reset_password_schema({"newPassword": "abc"})) == [
        {
            "code": "too_small",
            "minimum": 8,
            "type": "string",
            "inclusive": True,
            "exact": False,
            "message": "Password must be at least 8 characters",
            "path": ["newPassword"],
        }
    ]
    assert issues_of(
        v.admin_reset_password_schema({"newPassword": "x" * 129})
    ) == [
        {
            "code": "too_big",
            "maximum": 128,
            "type": "string",
            "inclusive": True,
            "exact": False,
            "message": "Password too long",
            "path": ["newPassword"],
        }
    ]


# ── transferDomainSchema ─────────────────────────────────────────────────────


def test_transfer_domain_uuid_message_and_missing_field():
    assert issues_of(v.transfer_domain_schema({"newUserId": "nope"})) == [
        {
            "validation": "uuid",
            "code": "invalid_string",
            "message": "Invalid user ID",
            "path": ["newUserId"],
        }
    ]
    assert issues_of(v.transfer_domain_schema({})) == [
        {
            "code": "invalid_type",
            "expected": "string",
            "received": "undefined",
            "path": ["newUserId"],
            "message": "Required",
        }
    ]


def test_transfer_domain_default_uuid_message_is_invalid_uuid():
    """`purgeEventsSchema.domainId` has no custom message."""
    assert issues_of(v.purge_events_schema({"domainId": "nope"})) == [
        {
            "validation": "uuid",
            "code": "invalid_string",
            "message": "Invalid uuid",
            "path": ["domainId"],
        }
    ]


# ── purgeEventsSchema ────────────────────────────────────────────────────────


def test_purge_refine_reports_custom_issue_with_empty_path():
    assert issues_of(v.purge_events_schema({})) == [
        {
            "code": "custom",
            "message": "Must specify domainId and/or before date",
            "path": [],
        }
    ]


def test_purge_refine_does_not_run_when_the_object_already_failed():
    """Only the uuid issue — the `.refine()` is skipped entirely."""
    assert issues_of(v.purge_events_schema({"domainId": "nope"})) == [
        {
            "validation": "uuid",
            "code": "invalid_string",
            "message": "Invalid uuid",
            "path": ["domainId"],
        }
    ]


def test_purge_accepts_domain_id_or_before_alone():
    assert v.purge_events_schema({"before": "2026-01-01"})[1] == []
    assert (
        v.purge_events_schema({"domainId": "aaaaaaaa-0000-0000-0000-000000000001"})[1]
        == []
    )


# ── Number / integer checks ──────────────────────────────────────────────────


def test_int_check_reports_message_before_path():
    """A Zod quirk: the `.int()` issue orders `message` before `path`."""
    issue = issues_of(v.create_plan_schema(
        {
            "id": "trial",
            "name": "t",
            "price": 1.5,
            "events_limit": 1,
            "domains_limit": 1,
        }
    ))[0]
    assert issue == {
        "code": "invalid_type",
        "expected": "integer",
        "received": "float",
        "message": "Expected integer, received float",
        "path": ["price"],
    }
    # Assert the literal key order too, since only the bytes matter downstream.
    assert list(issue.keys()) == [
        "code",
        "expected",
        "received",
        "message",
        "path",
    ]


def test_int_check_does_not_short_circuit_the_range_check():
    """`-1.5` fails both `.int()` and `.min(0)`."""
    assert issues_of(
        v.create_plan_schema(
            {
                "id": "trial",
                "name": "t",
                "price": -1.5,
                "events_limit": 1,
                "domains_limit": 1,
            }
        )
    ) == [
        {
            "code": "invalid_type",
            "expected": "integer",
            "received": "float",
            "message": "Expected integer, received float",
            "path": ["price"],
        },
        {
            "code": "too_small",
            "minimum": 0,
            "type": "number",
            "inclusive": True,
            "exact": False,
            "message": "Number must be greater than or equal to 0",
            "path": ["price"],
        },
    ]


def test_integral_float_is_accepted_and_emitted_as_an_integer():
    """JS has one number type, so `1.0` is a valid int and serialises as `1`."""
    data, issues = v.create_plan_schema(
        {
            "id": "trial",
            "name": "t",
            "price": 1.0,
            "events_limit": 1,
            "domains_limit": 1,
        }
    )
    assert issues == []
    assert data["price"] == 1
    assert isinstance(data["price"], int)


def test_string_checks_accumulate_within_one_field():
    """A 1-char uppercase id fails `min(2)` *and* the regex, not just `min`."""
    assert issues_of(v.create_plan_schema({"id": "A"}))[:2] == [
        {
            "code": "too_small",
            "minimum": 2,
            "type": "string",
            "inclusive": True,
            "exact": False,
            "message": "String must contain at least 2 character(s)",
            "path": ["id"],
        },
        {
            "validation": "regex",
            "code": "invalid_string",
            "message": "Plan ID must be lowercase alphanumeric",
            "path": ["id"],
        },
    ]


# ── createPlanSchema defaults ────────────────────────────────────────────────


def test_create_plan_applies_defaults_and_reports_every_missing_required_field():
    data, issues = v.create_plan_schema(
        {"id": "trial", "name": "Trial", "price": 0, "events_limit": 1000, "domains_limit": 1}
    )
    assert issues == []
    assert data == {
        "id": "trial",
        "name": "Trial",
        "price": 0,
        "currency": "NGN",
        "interval": "monthly",
        "events_limit": 1000,
        "domains_limit": 1,
        "retention_days": 30,
        "features": [],
        "active": True,
        "sort_order": 0,
    }

    assert issues_of(v.create_plan_schema({})) == [
        {
            "code": "invalid_type",
            "expected": "string",
            "received": "undefined",
            "path": ["id"],
            "message": "Required",
        },
        {
            "code": "invalid_type",
            "expected": "string",
            "received": "undefined",
            "path": ["name"],
            "message": "Required",
        },
        {
            "code": "invalid_type",
            "expected": "number",
            "received": "undefined",
            "path": ["price"],
            "message": "Required",
        },
        {
            "code": "invalid_type",
            "expected": "number",
            "received": "undefined",
            "path": ["events_limit"],
            "message": "Required",
        },
        {
            "code": "invalid_type",
            "expected": "number",
            "received": "undefined",
            "path": ["domains_limit"],
            "message": "Required",
        },
    ]


def test_string_array_reports_every_bad_element():
    base = {
        "id": "trial",
        "name": "t",
        "price": 0,
        "events_limit": 1,
        "domains_limit": 1,
    }
    assert issues_of(v.create_plan_schema({**base, "features": "a"})) == [
        {
            "code": "invalid_type",
            "expected": "array",
            "received": "string",
            "path": ["features"],
            "message": "Expected array, received string",
        }
    ]
    assert issues_of(v.create_plan_schema({**base, "features": [1, 2]})) == [
        {
            "code": "invalid_type",
            "expected": "string",
            "received": "number",
            "path": ["features", 0],
            "message": "Expected string, received number",
        },
        {
            "code": "invalid_type",
            "expected": "string",
            "received": "number",
            "path": ["features", 1],
            "message": "Expected string, received number",
        },
    ]


# ── updateSettingSchema (union) ──────────────────────────────────────────────


def test_setting_union_accepts_each_scalar():
    assert v.update_setting_schema({"value": "abc"})[0] == {"value": "abc"}
    assert v.update_setting_schema({"value": 5})[0] == {"value": 5}
    assert v.update_setting_schema({"value": False})[0] == {"value": False}


def test_setting_union_reports_all_members():
    expected_union_errors = [
        {
            "issues": [
                {
                    "code": "invalid_type",
                    "expected": "string",
                    "received": "array",
                    "path": ["value"],
                    "message": "Expected string, received array",
                }
            ],
            "name": "ZodError",
        },
        {
            "issues": [
                {
                    "code": "invalid_type",
                    "expected": "number",
                    "received": "array",
                    "path": ["value"],
                    "message": "Expected number, received array",
                }
            ],
            "name": "ZodError",
        },
        {
            "issues": [
                {
                    "code": "invalid_type",
                    "expected": "boolean",
                    "received": "array",
                    "path": ["value"],
                    "message": "Expected boolean, received array",
                }
            ],
            "name": "ZodError",
        },
    ]
    assert issues_of(v.update_setting_schema({"value": []})) == [
        {
            "code": "invalid_union",
            "unionErrors": expected_union_errors,
            "path": ["value"],
            "message": "Invalid input",
        }
    ]


def test_setting_union_missing_key_reports_undefined():
    assert issues_of(v.update_setting_schema({})) == [
        {
            "code": "invalid_union",
            "unionErrors": [
                {
                    "issues": [
                        {
                            "code": "invalid_type",
                            "expected": "string",
                            "received": "undefined",
                            "path": ["value"],
                            "message": "Required",
                        }
                    ],
                    "name": "ZodError",
                },
                {
                    "issues": [
                        {
                            "code": "invalid_type",
                            "expected": "number",
                            "received": "undefined",
                            "path": ["value"],
                            "message": "Required",
                        }
                    ],
                    "name": "ZodError",
                },
                {
                    "issues": [
                        {
                            "code": "invalid_type",
                            "expected": "boolean",
                            "received": "undefined",
                            "path": ["value"],
                            "message": "Required",
                        }
                    ],
                    "name": "ZodError",
                },
            ],
            "path": ["value"],
            "message": "Invalid input",
        }
    ]


# ── createPromoSchema ────────────────────────────────────────────────────────


def test_promo_code_is_upper_cased_and_trimmed_and_defaults_are_filled():
    data, issues = v.create_promo_schema(
        {"code": "save20", "discount_type": "percentage", "discount_value": 20}
    )
    assert issues == []
    assert data == {
        "code": "SAVE20",
        "discount_type": "percentage",
        "discount_value": 20,
        "applicable_plans": [],
        "max_per_user": 1,
        "active": True,
    }


def test_promo_percentage_refine_message():
    assert issues_of(
        v.create_promo_schema(
            {"code": "save20", "discount_type": "percentage", "discount_value": 200}
        )
    ) == [
        {
            "code": "custom",
            "message": "Percentage discount cannot exceed 100%",
            "path": [],
        }
    ]


def test_promo_flat_discount_above_100_is_allowed():
    assert (
        issues_of(
            v.create_promo_schema(
                {"code": "save20", "discount_type": "flat", "discount_value": 200}
            )
        )
        == []
    )


def test_promo_nullable_fields_accept_explicit_null():
    data, issues = v.create_promo_schema(
        {
            "code": "save20",
            "discount_type": "percentage",
            "discount_value": 20,
            "max_uses": None,
            "expires_at": None,
        }
    )
    assert issues == []
    assert data["max_uses"] is None
    assert data["expires_at"] is None


def test_promo_datetime_requires_a_trailing_z_and_rejects_offsets():
    assert issues_of(
        v.create_promo_schema(
            {
                "code": "save20",
                "discount_type": "percentage",
                "discount_value": 20,
                "expires_at": "not-a-date",
            }
        )
    ) == [
        {
            "code": "invalid_string",
            "validation": "datetime",
            "message": "Invalid datetime",
            "path": ["expires_at"],
        }
    ]

    def with_date(value: str) -> list[dict]:
        return issues_of(
            v.create_promo_schema(
                {
                    "code": "save20",
                    "discount_type": "percentage",
                    "discount_value": 20,
                    "expires_at": value,
                }
            )
        )

    assert with_date("2026-01-01T00:00:00Z") == []
    assert with_date("2026-01-01T00:00Z") == []          # seconds are optional
    assert with_date("2026-01-01T00:00:00.123Z") == []   # ms allowed
    assert with_date("2024-02-29T00:00:00Z") == []       # leap day
    assert with_date("2026-01-01T00:00:00+01:00") != []  # offsets are off
    assert with_date("2026-01-01") != []
    assert with_date("2025-02-29T00:00:00Z") != []       # not a leap year


def test_update_promo_empty_body_is_valid_and_trims_the_code():
    assert v.update_promo_schema({}) == ({}, [])
    assert v.update_promo_schema({"code": " xyz9 "})[0] == {"code": "XYZ9"}


# ── Email / datetime regex fidelity ──────────────────────────────────────────


@pytest.mark.parametrize(
    "address, valid",
    [
        ("a@b.co", True),
        ("A@B.CO", True),
        ("a@b.c0m", False),   # TLD must be letters only
        ("a@b", False),       # needs a dot
        ("a..b@c.co", False),  # no consecutive dots
        (".a@c.co", False),    # no leading dot
    ],
)
def test_email_regex_matches_zod(address: str, valid: bool):
    issues = issues_of(v.update_user_schema({"email": address}))
    assert (issues == []) is valid


def test_boolean_rejects_a_string():
    assert issues_of(v.update_admin_domain_schema({"verified": "yes"})) == [
        {
            "code": "invalid_type",
            "expected": "boolean",
            "received": "string",
            "path": ["verified"],
            "message": "Expected boolean, received string",
        }
    ]
