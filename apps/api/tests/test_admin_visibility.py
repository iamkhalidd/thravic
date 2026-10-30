"""What the admin can now see: job failures, each user's emails, AI usage and
the stores using the Shopify app.

The database tests are skipped unless `THRAVIC_TEST_DATABASE_URL` is set.
Other tests share the database, so assertions only look at this test's rows.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.config import get_settings
from app.jobs import daily_stats, runner
from app.routers.admin import ai as admin_ai
from app.routers.admin import integrations as admin_integrations
from app.routers.admin import system as admin_system
from app.routers.admin import users as admin_users
from app.services import ai_usage_service, email_service
from tests.conftest import requires_test_db

NOW = datetime(2026, 10, 30, 12, tzinfo=UTC)
HOUR = timedelta(hours=1)


def _body(response) -> dict:
    return json.loads(response.body)


# ── Job status (no database) ──────────────────────────────────────────────


def test_a_job_that_ran_on_time_is_ok():
    assert admin_system.job_status(NOW - HOUR, None, HOUR, NOW) == "ok"


def test_a_job_past_its_interval_and_the_grace_is_late():
    assert admin_system.job_status(NOW - 4 * HOUR, None, HOUR, NOW) == "late"


def test_an_error_after_the_last_good_run_is_failing():
    assert admin_system.job_status(NOW - 2 * HOUR, NOW - HOUR, HOUR, NOW) == "failing"
    assert admin_system.job_status(None, NOW - HOUR, HOUR, NOW) == "failing"


def test_an_old_error_followed_by_a_good_run_is_ok():
    assert admin_system.job_status(NOW - HOUR, NOW - 3 * HOUR, HOUR, NOW) == "ok"


def test_a_job_with_no_row_has_never_run():
    assert admin_system.job_status(None, None, HOUR, NOW) == "never"


def test_cost_uses_the_configured_prices(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "AI_PRICE_INPUT_PER_M", 1.0)
    monkeypatch.setattr(settings, "AI_PRICE_OUTPUT_PER_M", 2.0)
    assert admin_ai.cost(1_000_000, 500_000) == 2.0


# ── With a database ───────────────────────────────────────────────────────


@pytest.fixture
def no_provider(monkeypatch):
    """No email provider, so sends take the logged development path."""
    settings = get_settings()
    monkeypatch.setattr(settings, "RESEND_API_KEY", None)
    monkeypatch.setattr(settings, "SMTP_HOST", None)


async def _owner(db_pool, domain_id: str) -> tuple[str, str]:
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT u.id, u.email FROM users u JOIN domains d ON d.user_id = u.id WHERE d.id = $1",
            uuid.UUID(domain_id),
        )
    return str(row["id"]), row["email"]


@requires_test_db
async def test_a_failing_job_is_recorded_and_still_due(db_pool):
    name = f"test_job_{uuid.uuid4().hex[:8]}"

    async def boom():
        raise RuntimeError("provider down")

    try:
        with pytest.raises(RuntimeError):
            await runner.run_if_due(name, HOUR, boom)
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM job_runs WHERE name = $1", name)
        assert row["last_run_at"] is None
        assert row["last_error"] == "RuntimeError: provider down"

        async def fine():
            return {"sent": 1}

        assert await runner.run_if_due(name, HOUR, fine) is True
        jobs = _body(await admin_system.jobs())["jobs"]
        mine = next(j for j in jobs if j["name"] == name)
        assert mine["status"] == "ok"
        assert mine["details"] == {"sent": 1}
    finally:
        async with db_pool.acquire() as conn:
            await conn.execute("DELETE FROM job_runs WHERE name = $1", name)


@requires_test_db
async def test_every_email_to_a_user_shows_in_their_history(seeded_domain, db_pool, no_provider):
    user_id, email = await _owner(db_pool, seeded_domain)

    await email_service.send_welcome_email(email.upper(), "Ada")
    await email_service.send_email(email, "Hand-written", "<p>hi</p>", kind="direct")

    history = _body(await admin_users.user_emails(user_id))
    assert [(e["subject"], e["kind"], e["status"]) for e in history["emails"]] == [
        ("Hand-written", "direct", "dev"),
        (history["emails"][1]["subject"], "welcome", "dev"),
    ]
    assert history["notifications"] == {}


@requires_test_db
async def test_ai_calls_are_counted_per_feature_and_owner(seeded_domain, db_pool):
    user_id, _ = await _owner(db_pool, seeded_domain)
    with ai_usage_service.scope("explain", seeded_domain):
        await ai_usage_service.record({"prompt_tokens": 1200, "completion_tokens": 300}, ok=True)
        await ai_usage_service.record(None, ok=False)

    body = _body(await admin_ai.ai_usage(SimpleNamespace(query_params={"days": "7"})))
    mine = next(a for a in body["accounts"] if a["user_id"] == user_id)
    assert (mine["calls"], mine["failed"]) == (2, 1)
    assert (mine["prompt_tokens"], mine["completion_tokens"]) == (1200, 300)
    assert "explain" in [f["feature"] for f in body["features"]]


@requires_test_db
async def test_shopify_traffic_lists_the_store(seeded_domain, db_pool):
    domain = uuid.UUID(seeded_domain)
    async with db_pool.acquire() as conn:
        visitor = await conn.fetchval(
            "INSERT INTO visitors (visitor_id, domain_id) VALUES ($1, $2) RETURNING id",
            str(uuid.uuid4()),
            domain,
        )
        session = await conn.fetchval(
            "INSERT INTO sessions (session_id, visitor_id, domain_id) VALUES ($1, $2, $3) "
            "RETURNING id",
            str(uuid.uuid4()),
            visitor,
            domain,
        )
        for event_id in ("shopify-1", "shopify-2", None):
            await conn.execute(
                "INSERT INTO events (domain_id, session_id, visitor_id, type, url, event_id) "
                "VALUES ($1, $2, $3, 'custom', 'https://shop.example/', $4)",
                domain,
                session,
                visitor,
                event_id and f"{event_id}-{uuid.uuid4().hex}",
            )
    today = daily_stats.report_today()
    start, end = daily_stats.day_bounds(today)
    await daily_stats.query(daily_stats.UPSERT_SQL, domain, today, start, end)

    stores = _body(await admin_integrations.shopify_stores())["stores"]
    mine = next(s for s in stores if s["domain_id"] == seeded_domain)
    assert mine["events_7d"] == 2
    assert mine["active"] is True
