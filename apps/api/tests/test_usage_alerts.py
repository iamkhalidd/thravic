"""Usage-limit emails: 80% and 100%, each once per user per month.

Skipped unless `THRAVIC_TEST_DATABASE_URL` is set. Other tests share the
database, so assertions only look at mail to this test's user.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.jobs import usage_alerts
from tests.conftest import requires_test_db

pytestmark = requires_test_db


@pytest.fixture
def outbox(monkeypatch):
    mail: list[dict] = []
    state = {"fail": False}

    async def _send(to, name, threshold, used, limit, plan, resets_at):
        if state["fail"]:
            raise ConnectionError("provider rejected the message")
        mail.append(
            {"to": to, "threshold": threshold, "used": used, "limit": limit, "resets": resets_at}
        )

    monkeypatch.setattr(usage_alerts, "send_usage_limit_email", _send)
    return mail, state


@pytest.fixture
async def owner(seeded_domain, db_pool, make_plan):
    """The seeded domain's owner on an active plan with a 10-event limit."""
    plan = await make_plan(events_limit=10)
    async with db_pool.acquire() as conn:
        user_id, email = await conn.fetchrow(
            "SELECT u.id, u.email FROM domains d JOIN users u ON u.id = d.user_id WHERE d.id = $1",
            seeded_domain,
        )
        await conn.execute(
            "INSERT INTO subscriptions (user_id, plan, status, events_limit, domains_limit) "
            "VALUES ($1, $2, 'active', 0, 0)",
            user_id,
            plan,
        )

    async def add_events(count: int) -> None:
        async with db_pool.acquire() as conn:
            await conn.executemany(
                "INSERT INTO events (domain_id, type, url) VALUES ($1, 'pageview', 'https://x/')",
                [(seeded_domain,)] * count,
            )

    return {"id": user_id, "email": email, "add_events": add_events}


def _to(mail, owner):
    return [m["threshold"] for m in mail if m["to"] == owner["email"]]


async def test_80_then_100_each_sent_once(owner, outbox):
    mail, _ = outbox
    await owner["add_events"](8)
    await usage_alerts.send_usage_alerts()
    await usage_alerts.send_usage_alerts()
    assert _to(mail, owner) == [80]

    await owner["add_events"](2)
    await usage_alerts.send_usage_alerts()
    await usage_alerts.send_usage_alerts()
    assert _to(mail, owner) == [80, 100]


async def test_jumping_past_the_limit_sends_only_the_100_email(owner, outbox):
    mail, _ = outbox
    await owner["add_events"](12)

    await usage_alerts.send_usage_alerts()
    await usage_alerts.send_usage_alerts()

    assert _to(mail, owner) == [100]


async def test_under_80_sends_nothing(owner, outbox):
    mail, _ = outbox
    await owner["add_events"](7)

    await usage_alerts.send_usage_alerts()

    assert _to(mail, owner) == []


async def test_a_failed_send_is_retried_on_the_next_run(owner, outbox):
    mail, state = outbox
    await owner["add_events"](10)

    state["fail"] = True
    result = await usage_alerts.send_usage_alerts()
    assert result["failed"] >= 1 and _to(mail, owner) == []

    state["fail"] = False
    await usage_alerts.send_usage_alerts()
    assert _to(mail, owner) == [100]


async def test_suspended_owners_are_not_emailed(owner, outbox, db_pool):
    mail, _ = outbox
    await owner["add_events"](10)
    async with db_pool.acquire() as conn:
        await conn.execute("UPDATE users SET role = 'suspended' WHERE id = $1", owner["id"])

    await usage_alerts.send_usage_alerts()

    assert _to(mail, owner) == []


async def test_a_paid_plan_counts_from_its_billing_cycle(owner, outbox, db_pool):
    """Paid 35 days ago: the second 30-day cycle began 5 days ago, so events from
    before then are last cycle's, and the allowance renews in 25 days."""
    mail, _ = outbox
    async with db_pool.acquire() as conn:
        await conn.execute(
            "UPDATE subscriptions SET current_period_start = NOW() - INTERVAL '35 days', "
            "current_period_end = NOW() + INTERVAL '25 days' WHERE user_id = $1",
            owner["id"],
        )
    await owner["add_events"](11)
    async with db_pool.acquire() as conn:
        await conn.execute(
            "UPDATE events SET created_at = NOW() - INTERVAL '6 days' WHERE id IN ("
            "SELECT e.id FROM events e JOIN domains d ON d.id = e.domain_id "
            "WHERE d.user_id = $1 LIMIT 3)",
            owner["id"],
        )

    await usage_alerts.send_usage_alerts()

    (alert,) = [m for m in mail if m["to"] == owner["email"]]
    assert alert["threshold"] == 80 and alert["used"] == 8  # 11 - 3 from last cycle
    renews_in = alert["resets"] - datetime.now(UTC)
    assert timedelta(days=24) < renews_in < timedelta(days=26)
