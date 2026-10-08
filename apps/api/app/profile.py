"""What a user's profile must hold, and how each field is checked.

Required: full name, date of birth (18 or older), country and phone. Company,
job title, website and timezone are optional, but checked when given. The date of
birth is set once; only support can change it afterwards.

The web app keeps the same country list (`apps/web/src/lib/countries.ts`).
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime
from typing import Any
from zoneinfo import available_timezones

MINIMUM_AGE = 18
MAXIMUM_AGE = 120
REQUIRED_FIELDS = ("name", "date_of_birth", "country", "phone")

UNDERAGE = "underage"
UNDERAGE_MESSAGE = "You must be 18 or older to use Thravic."
# A restricted (under-18) account is deleted this long after it was restricted.
UNDERAGE_GRACE_DAYS = 30

# ISO 3166-1 alpha-2.
COUNTRY_CODES = frozenset(
    """
    AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO
    BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ
    DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP
    GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG
    KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML
    MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE
    PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL
    SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM
    US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
    """.split()
)

# E.164: "+", a country code that doesn't start with 0, 8-15 digits in all.
_PHONE_RE = re.compile(r"^\+[1-9]\d{7,14}$")
_PHONE_SEPARATORS = re.compile(r"[\s\-().]")
_WEBSITE_RE = re.compile(r"^https?://[^\s/$.?#][^\s]*\.[^\s]{2,}$", re.IGNORECASE)

TEXT_LIMITS = {"name": (2, 100), "company": (1, 100), "job_title": (1, 100)}
WEBSITE_MAX = 255


class ProfileError(ValueError):
    """A field failed its check; `field` names it for the form."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field


def as_date(value: date | datetime | None) -> date | None:
    """A stored date of birth as a date (the database codec returns DATE columns
    as midnight-UTC datetimes)."""
    if isinstance(value, datetime):
        return value.astimezone(UTC).date()
    return value


def age_on(born: date, today: date) -> int:
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def today() -> date:
    return datetime.now(UTC).date()


def parse_date_of_birth(value: Any) -> date:
    """A real YYYY-MM-DD date for someone 0-120 years old. Age is checked apart."""
    if not isinstance(value, str) or not value.strip():
        raise ProfileError("date_of_birth", "Enter your date of birth")
    try:
        born = date.fromisoformat(value.strip())
    except ValueError:
        raise ProfileError("date_of_birth", "Enter a valid date of birth") from None
    if born > today() or age_on(born, today()) > MAXIMUM_AGE:
        raise ProfileError("date_of_birth", "Enter a valid date of birth")
    return born


def is_adult(born: date) -> bool:
    return age_on(born, today()) >= MINIMUM_AGE


def normalize_phone(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ProfileError("phone", "Enter your phone number")
    phone = _PHONE_SEPARATORS.sub("", value.strip())
    if phone.startswith("00"):
        phone = "+" + phone[2:]
    if not _PHONE_RE.match(phone):
        raise ProfileError(
            "phone", "Enter your phone number with its country code, e.g. +234 803 123 4567"
        )
    return phone


def normalize_country(value: Any) -> str:
    code = value.strip().upper() if isinstance(value, str) else ""
    if code not in COUNTRY_CODES:
        raise ProfileError("country", "Choose your country")
    return code


def _text(field: str, value: Any, required: bool) -> str | None:
    text = value.strip() if isinstance(value, str) else ""
    if not text:
        if required:
            raise ProfileError(field, "This field is required")
        return None
    low, high = TEXT_LIMITS[field]
    if not low <= len(text) <= high:
        raise ProfileError(field, f"Must be {low}-{high} characters")
    return text


def _website(value: Any) -> str | None:
    text = value.strip() if isinstance(value, str) else ""
    if not text:
        return None
    if len(text) > WEBSITE_MAX or not _WEBSITE_RE.match(text):
        raise ProfileError("website", "Enter a full address starting with https://")
    return text


def _timezone(value: Any) -> str | None:
    text = value.strip() if isinstance(value, str) else ""
    if not text:
        return None
    if text not in available_timezones():
        raise ProfileError("timezone", "Choose a timezone from the list")
    return text


_CLEANERS = {
    "name": lambda v: _text("name", v, required=True),
    "phone": normalize_phone,
    "country": normalize_country,
    "company": lambda v: _text("company", v, required=False),
    "job_title": lambda v: _text("job_title", v, required=False),
    "website": _website,
    "timezone": _timezone,
}


def clean_profile_fields(body: dict[str, Any]) -> dict[str, Any]:
    """The editable fields present in `body`, checked and normalized.

    Required fields can be changed but not cleared; optional ones clear to NULL.
    Raises `ProfileError` for the first field that fails.
    """
    return {field: clean(body[field]) for field, clean in _CLEANERS.items() if field in body}


def missing_fields(user: dict[str, Any]) -> list[str]:
    """Required fields that are empty or no longer pass their check (values
    saved before these rules, like a free-text country, count as missing)."""
    missing = []
    for field in REQUIRED_FIELDS:
        value = user.get(field)
        try:
            if field == "date_of_birth":
                if value is None:
                    raise ProfileError(field, "")
            elif field == "name":
                _text("name", value, required=True)
            else:
                _CLEANERS[field](value)
        except ProfileError:
            missing.append(field)
    return missing
