"""Usage-limit emails: 80% and 100%, each once per user per month.

Skipped unless `THRAVIC_TEST_DATABASE_URL` is set. Other tests share the
database, so assertions only look at mail to this test's user.
"""

from __future__ import annotations

import pytest

from app.jobs import usage_alerts
from tests.conftest import requires_test_db

pytestmark = requires_test_db


@pytest.fixture
def outbox(monkeypatch):
    mail: list[dict] = []
    state = {"fail": False}

    async def _send(to, name, threshold, used, limit, plan):
        if state["fail"]:
            raise ConnectionError("provider rejected the message")
        mail.append({"to": to, "threshold": threshold, "used": used, "limit": limit})

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
