"""Profiles: what's required, how fields are checked, and 18+ only.

Sign-up asks for a date of birth, country and phone and refuses anyone under 18.
Existing accounts must complete those before the dashboard's data opens up. A
date of birth is set once; someone under 18 is deleted (no sites) or restricted
(sites stop collecting; deleted after the grace period unless support corrects
it).
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import httpx
import pytest

from app import profile
from app.jobs import restricted_accounts
from app.main import app
from app.middleware import profile_gate
from app.middleware.admin_auth import AdminUser, admin_auth
from app.middleware.settings_gate import registration_gate
from app.routers import auth as auth_routes
from app.services import plan_service
from tests.conftest import requires_test_db

TODAY = profile.today()


def _years_ago(years: int, days: int = 0) -> date:
    try:
        born = TODAY.replace(year=TODAY.year - years)
    except ValueError:  # Feb 29 -> Feb 28
        born = TODAY.replace(year=TODAY.year - years, day=28)
    return born + timedelta(days=days)


# ── Field checks ───────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("raw", "stored"),
    [
        ("+234 803 123 4567", "+2348031234567"),
        ("+1 (415) 555-0100", "+14155550100"),
        ("00447911123456", "+447911123456"),
    ],
)
def test_phones_are_stored_in_international_format(raw, stored):
    assert profile.normalize_phone(raw) == stored


@pytest.mark.parametrize("raw", ["0803 123 4567", "+0123456789", "+12", "call me", ""])
def test_phones_without_a_country_code_are_refused(raw):
    with pytest.raises(profile.ProfileError) as error:
        profile.normalize_phone(raw)
    assert error.value.field == "phone"


def test_countries_are_iso_codes():
    assert profile.normalize_country(" ng ") == "NG"
    with pytest.raises(profile.ProfileError):
        profile.normalize_country("Nigeria")


@pytest.mark.parametrize(
    ("born", "adult"),
    [
        (_years_ago(18), True),  # 18 today
        (_years_ago(18, days=1), False),  # 18 tomorrow
        (_years_ago(30), True),
    ],
)
def test_adult_means_18_today(born, adult):
    assert profile.is_adult(born) is adult


def test_a_leap_day_birthday_turns_18_on_march_1st():
    assert profile.age_on(date(2008, 2, 29), date(2026, 2, 28)) == 17
    assert profile.age_on(date(2008, 2, 29), date(2026, 3, 1)) == 18


@pytest.mark.parametrize(
    "raw", ["", "29/02/1990", "1990-02-30", (TODAY + timedelta(days=1)).isoformat(), "1890-01-01"]
)
def test_impossible_dates_of_birth_are_refused(raw):
    with pytest.raises(profile.ProfileError):
        profile.parse_date_of_birth(raw)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("website", "example.com"),
        ("website", "javascript:alert(1)"),
        ("timezone", "Mars/Base"),
        ("name", "A"),
        ("company", "x" * 101),
    ],
)
def test_optional_fields_are_still_checked(field, value):
    with pytest.raises(profile.ProfileError) as error:
        profile.clean_profile_fields({field: value})
    assert error.value.field == field


def test_optional_fields_clear_but_required_ones_do_not():
    assert profile.clean_profile_fields({"website": "", "company": " "}) == {
        "website": None,
        "company": None,
    }
    with pytest.raises(profile.ProfileError):
        profile.clean_profile_fields({"phone": ""})


def test_values_saved_before_these_rules_count_as_missing():
    legacy = {"name": "Ada", "date_of_birth": None, "country": "Nigeria", "phone": "0803"}
    assert profile.missing_fields(legacy) == ["date_of_birth", "country", "phone"]


# ── HTTP ───────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _open_registration():
    app.dependency_overrides[registration_gate] = lambda: None
    yield
    app.dependency_overrides.clear()


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t")


def _signup(**overrides):
    body = {
        "email": f"p-{uuid.uuid4().hex[:10]}@example.invalid",
        "password": "Passw0rd!",
        "name": "Ada Lovelace",
        "date_of_birth": _years_ago(30).isoformat(),
        "country": "ng",
        "phone": "+234 803 123 4567",
    }
    return {**body, **overrides}


async def _user(db_pool, email):
    async with db_pool.acquire() as conn:
        return await conn.fetchrow("SELECT * FROM users WHERE email = $1", email)


@pytest.fixture
async def legacy_user(db_pool):
    """An account from before these rules: no date of birth, free-text country."""
    async with db_pool.acquire() as conn:
        user_id = await conn.fetchval(
            "INSERT INTO users (email, name, country) VALUES ($1, 'Old Timer', 'Nigeria') "
            "RETURNING id",
            f"legacy-{uuid.uuid4().hex[:10]}@example.invalid",
        )
    tokens = await auth_routes.generate_tokens(str(user_id), "legacy@example.invalid")
    profile_gate.forget(str(user_id))
    yield {"id": str(user_id), "headers": {"Authorization": f"Bearer {tokens['accessToken']}"}}
    async with db_pool.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE id = $1", user_id)


async def _add_site(db_pool, user_id):
    async with db_pool.acquire() as conn:
        return str(
            await conn.fetchval(
                "INSERT INTO domains (user_id, domain, name, tracking_id) "
                "VALUES ($1, 'kid.example.invalid', 'Kid', $2) RETURNING id",
                user_id,
                f"trk_{uuid.uuid4().hex[:12]}",
            )
        )


@requires_test_db
async def test_sign_up_stores_the_checked_fields(db_pool):
    body = _signup()
    async with _client() as client:
        response = await client.post("/api/auth/register", json=body)
    try:
        assert response.status_code == 201, response.json()
        user = await _user(db_pool, body["email"])
        assert (user["country"], user["phone"]) == ("NG", "+2348031234567")
        assert profile.as_date(user["date_of_birth"]) == _years_ago(30)
        assert profile.missing_fields(dict(user)) == []
    finally:
        async with db_pool.acquire() as conn:
            await conn.execute("DELETE FROM users WHERE email = $1", body["email"])


@requires_test_db
async def test_sign_up_under_18_is_refused_and_nothing_is_stored(db_pool):
    body = _signup(date_of_birth=_years_ago(18, days=1).isoformat())
    async with _client() as client:
        response = await client.post("/api/auth/register", json=body)

    assert response.status_code == 403
    assert response.json()["error"] == profile.UNDERAGE_MESSAGE
    assert await _user(db_pool, body["email"]) is None


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"date_of_birth": ""}, "Enter your date of birth"),
        ({"country": "Nigeria"}, "Choose your country"),
        ({"phone": "0803 123 4567"}, "country code"),
    ],
)
@requires_test_db
async def test_sign_up_needs_each_required_field(db_pool, overrides, message):
    async with _client() as client:
        response = await client.post("/api/auth/register", json=_signup(**overrides))

    assert response.status_code == 400
    assert message in response.json()["error"]


@requires_test_db
async def test_an_incomplete_profile_keeps_dashboard_data_closed(legacy_user):
    async with _client() as client:
        me = (await client.get("/api/auth/me", headers=legacy_user["headers"])).json()
        blocked = await client.get("/api/domains", headers=legacy_user["headers"])
        completed = await client.patch(
            "/api/auth/me",
            headers=legacy_user["headers"],
            json={
                "date_of_birth": _years_ago(25).isoformat(),
                "country": "GH",
                "phone": "+233 24 123 4567",
            },
        )
        opened = await client.get("/api/domains", headers=legacy_user["headers"])

    assert me["profile_complete"] is False
    assert me["missing_fields"] == ["date_of_birth", "country", "phone"]
    assert blocked.status_code == 403 and blocked.json()["profileIncomplete"] is True
    assert completed.status_code == 200 and completed.json()["profile_complete"] is True
    assert opened.status_code == 200  # at once, no stale cache


@requires_test_db
async def test_bad_fields_are_refused_with_the_field_named(legacy_user):
    async with _client() as client:
        response = await client.patch(
            "/api/auth/me", headers=legacy_user["headers"], json={"phone": "12345"}
        )

    assert response.status_code == 400
    assert response.json()["field"] == "phone"


@requires_test_db
async def test_the_date_of_birth_is_set_once(legacy_user):
    first = _years_ago(25).isoformat()
    async with _client() as client:
        await client.patch(
            "/api/auth/me", headers=legacy_user["headers"], json={"date_of_birth": first}
        )
        same = await client.patch(
            "/api/auth/me", headers=legacy_user["headers"], json={"date_of_birth": first}
        )
        changed = await client.patch(
            "/api/auth/me",
            headers=legacy_user["headers"],
            json={"date_of_birth": _years_ago(40).isoformat()},
        )

    assert same.status_code == 200
    assert changed.status_code == 400 and changed.json()["field"] == "date_of_birth"


@requires_test_db
async def test_under_18_without_sites_is_deleted(db_pool, legacy_user):
    async with _client() as client:
        response = await client.patch(
            "/api/auth/me",
            headers=legacy_user["headers"],
            json={"date_of_birth": _years_ago(15).isoformat()},
        )

    assert response.status_code == 403 and response.json()["accountDeleted"] is True
    async with db_pool.acquire() as conn:
        assert await conn.fetchval("SELECT 1 FROM users WHERE id = $1", legacy_user["id"]) is None


@requires_test_db
async def test_under_18_with_sites_is_restricted(db_pool, legacy_user, monkeypatch):
    sent = []

    async def _email(*args):
        sent.append(args)

    monkeypatch.setattr(auth_routes.email_service, "send_account_restricted_email", _email)
    site = await _add_site(db_pool, legacy_user["id"])
    plan_service.clear_local_quota_cache()

    async with _client() as client:
        response = await client.patch(
            "/api/auth/me",
            headers=legacy_user["headers"],
            json={"date_of_birth": _years_ago(16).isoformat()},
        )
        locked = await client.get("/api/domains", headers=legacy_user["headers"])

    assert response.status_code == 403 and response.json()["restricted"] == "underage"
    assert locked.status_code == 403 and locked.json()["restricted"] == "underage"
    assert await plan_service.site_paused(legacy_user["id"], site) is True  # stops collecting
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT restricted_reason, restricted_at FROM users WHERE id = $1", legacy_user["id"]
        )
    assert row["restricted_reason"] == "underage" and row["restricted_at"] is not None


@requires_test_db
async def test_support_can_correct_a_date_of_birth(db_pool, legacy_user):
    async with db_pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET date_of_birth = $2, restricted_reason = 'underage', "
            "restricted_at = NOW() WHERE id = $1",
            legacy_user["id"],
            _years_ago(16),
        )
    admin = AdminUser(user_id=legacy_user["id"], email="a@x.invalid", role="admin")
    app.dependency_overrides[admin_auth] = lambda: admin
    async with _client() as client:
        response = await client.put(
            f"/api/admin/users/{legacy_user['id']}/date-of-birth",
            json={"date_of_birth": _years_ago(26).isoformat()},
        )

    assert response.status_code == 200, response.json()
    assert response.json()["restricted"] is None


@requires_test_db
async def test_restricted_accounts_are_deleted_after_the_grace_period(db_pool):
    ids = []
    async with db_pool.acquire() as conn:
        for days in (profile.UNDERAGE_GRACE_DAYS + 1, 10):
            ids.append(
                await conn.fetchval(
                    "INSERT INTO users (email, name, restricted_reason, restricted_at) "
                    "VALUES ($1, 'Kid', 'underage', NOW() - make_interval(days => $2)) "
                    "RETURNING id",
                    f"kid-{uuid.uuid4().hex[:10]}@example.invalid",
                    days,
                )
            )

    await restricted_accounts.delete_expired_restrictions()

    async with db_pool.acquire() as conn:
        left = {r["id"] for r in await conn.fetch("SELECT id FROM users WHERE id = ANY($1)", ids)}
        await conn.execute("DELETE FROM users WHERE id = ANY($1)", ids)
    assert left == {ids[1]}  # only the one past the grace period went


# ── Settings: notification choices and deleting the account ─────────────────


@requires_test_db
async def test_saving_one_preference_keeps_the_others(db_pool, legacy_user):
    async with db_pool.acquire() as conn:
        await conn.execute(
            """UPDATE users SET preferences = '{"theme": "dark"}'::jsonb WHERE id = $1""",
            legacy_user["id"],
        )
    async with _client() as client:
        response = await client.patch(
            "/api/auth/me",
            json={"preferences": {"notifications": {"trafficAlerts": False}}},
            headers=legacy_user["headers"],
        )
        me = (await client.get("/api/auth/me", headers=legacy_user["headers"])).json()

    assert response.status_code == 200, response.json()
    assert me["preferences"] == {"theme": "dark", "notifications": {"trafficAlerts": False}}


@requires_test_db
async def test_an_account_without_a_password_is_deleted_by_typing_its_email(db_pool, legacy_user):
    async with db_pool.acquire() as conn:
        email = await conn.fetchval("SELECT email FROM users WHERE id = $1", legacy_user["id"])

    async with _client() as client:
        me = (await client.get("/api/auth/me", headers=legacy_user["headers"])).json()
        wrong = await client.request(
            "DELETE", "/api/auth/me", json={"confirm": "someone@else.invalid"},
            headers=legacy_user["headers"],
        )
        right = await client.request(
            "DELETE", "/api/auth/me", json={"confirm": email.upper()},
            headers=legacy_user["headers"],
        )
        after = await client.get("/api/auth/me", headers=legacy_user["headers"])

    assert me["hasPassword"] is False
    assert (wrong.status_code, wrong.json()["field"]) == (400, "confirm")
    assert right.status_code == 200, right.json()
    assert after.status_code == 401  # the access token is revoked with the account
    async with db_pool.acquire() as conn:
        assert await conn.fetchval("SELECT 1 FROM users WHERE id = $1", legacy_user["id"]) is None


@requires_test_db
async def test_an_account_with_a_password_needs_it_to_be_deleted(db_pool, legacy_user):
    async with db_pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET password = $2 WHERE id = $1",
            legacy_user["id"],
            auth_routes.hash_password("correct horse battery"),
        )

    async with _client() as client:
        wrong = await client.request(
            "DELETE", "/api/auth/me", json={"password": "nope"}, headers=legacy_user["headers"]
        )
        right = await client.request(
            "DELETE", "/api/auth/me", json={"password": "correct horse battery"},
            headers=legacy_user["headers"],
        )

    assert (wrong.status_code, wrong.json()["field"]) == (400, "password")
    assert right.status_code == 200, right.json()
