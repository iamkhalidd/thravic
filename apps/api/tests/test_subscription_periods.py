"""Paid plans last for the period that was paid for.

A payment buys a period (30 days for a monthly plan). Access lasts until its end
plus `GRACE_DAYS`, then the account is on the free plan — decided from the dates
on every check, not by a job. Renewing the same plan extends from the current
end; each Paystack payment is applied once; owners are reminded a week before
the end; and a lapsed account's data is kept for a while after.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.jobs import subscription_reminders
from app.routers import payments
from app.services import domain_service, plan_catalog, plan_service, retention_service
from tests.conftest import requires_test_db

pytestmark = requires_test_db

NOW = datetime.now(UTC)
DAY = timedelta(days=1)


async def _owner(db_pool, domain_id):
    async with db_pool.acquire() as conn:
        return str(await conn.fetchval("SELECT user_id FROM domains WHERE id = $1", domain_id))


async def _subscribe(db_pool, user_id, plan, period_end, status="active"):
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO subscriptions
                (user_id, plan, status, events_limit, domains_limit,
                 current_period_start, current_period_end)
            VALUES ($1, $2, $3, 1, 1, $4, $4)
            ON CONFLICT (user_id) DO UPDATE SET
                plan = $2, status = $3, current_period_start = $4, current_period_end = $4
            """,
            user_id,
            plan,
            status,
            period_end,
        )
        if period_end is not None:
            await conn.execute(
                "UPDATE subscriptions SET current_period_start = $2 WHERE user_id = $1",
                user_id,
                period_end - 30 * DAY,
            )


async def _period(db_pool, user_id):
    async with db_pool.acquire() as conn:
        return await conn.fetchrow(
            "SELECT plan, current_period_start, current_period_end FROM subscriptions "
            "WHERE user_id = $1",
            user_id,
        )


def _close_to(value, expected, tolerance=timedelta(minutes=5)):
    return abs(value - expected) < tolerance


@pytest.fixture
def no_receipts(monkeypatch):
    monkeypatch.setattr(payments, "_fire_and_forget", lambda coro: coro.close())


@pytest.fixture(autouse=True)
def _fresh_catalog():
    plan_catalog.invalidate()
    yield
    plan_catalog.invalidate()


# ── Access follows the period ──────────────────────────────────────────────


@pytest.mark.parametrize(
    ("period_end", "keeps_plan"),
    [
        (NOW + 10 * DAY, True),  # in the period
        (NOW - 2 * DAY, True),  # in the grace days
        (NOW - (plan_service.GRACE_DAYS + 1) * DAY, False),  # lapsed
        (None, True),  # admin grant with no end date
    ],
)
async def test_access_lasts_for_the_period_plus_grace(
    seeded_domain, db_pool, make_plan, period_end, keeps_plan
):
    plan = await make_plan(features=["analytics", "heatmaps"])
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, plan, period_end)

    granted = await plan_service.for_user(owner)
    listed = await domain_service.list_by_user(owner)

    expected = plan if keeps_plan else "free"
    assert granted.name == expected
    assert listed[0]["owner_plan"] == expected  # the domain list agrees


async def test_a_canceled_subscription_grants_nothing(seeded_domain, db_pool, make_plan):
    plan = await make_plan()
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, plan, NOW + 10 * DAY, status="canceled")

    assert (await plan_service.for_user(owner)).name == "free"


# ── Payments ───────────────────────────────────────────────────────────────


async def test_a_first_payment_buys_thirty_days(seeded_domain, db_pool, make_plan, no_receipts):
    plan = await make_plan()
    owner = await _owner(db_pool, seeded_domain)

    await payments._upgrade_subscription(owner, plan, f"ref_{owner}_1", 500_000, "NGN")

    row = await _period(db_pool, owner)
    assert row["plan"] == plan
    assert _close_to(row["current_period_end"], NOW + 30 * DAY)


async def test_each_payment_is_applied_once(seeded_domain, db_pool, make_plan, no_receipts):
    """`/verify` and the webhook both report the same payment."""
    plan = await make_plan()
    owner = await _owner(db_pool, seeded_domain)
    reference = f"ref_{owner}_twice"

    await payments._upgrade_subscription(owner, plan, reference, 500_000, "NGN")
    await payments._upgrade_subscription(owner, plan, reference, 500_000, "NGN")

    row = await _period(db_pool, owner)
    assert _close_to(row["current_period_end"], NOW + 30 * DAY)  # not 60
    async with db_pool.acquire() as conn:
        statuses = await conn.fetch(
            "SELECT status FROM payment_history WHERE paystack_ref = $1", reference
        )
    assert [r["status"] for r in statuses] == ["success"]


async def test_the_pending_checkout_row_is_completed(
    seeded_domain, db_pool, make_plan, no_receipts
):
    plan = await make_plan()
    owner = await _owner(db_pool, seeded_domain)
    reference = f"ref_{owner}_pending"
    async with db_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO payment_history (user_id, plan, amount, currency, paystack_ref, status) "
            "VALUES ($1, $2, 450000, 'NGN', $3, 'pending')",
            owner,
            plan,
            reference,
        )

    await payments._upgrade_subscription(owner, plan, reference, 450_000, "NGN")

    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT status, amount FROM payment_history WHERE paystack_ref = $1", reference
        )
    assert [(r["status"], r["amount"]) for r in rows] == [("success", 450_000)]
    assert (await plan_service.for_user(owner)).name == plan


async def test_renewing_early_keeps_the_days_left(seeded_domain, db_pool, make_plan, no_receipts):
    plan = await make_plan()
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, plan, NOW + 10 * DAY)
    started = (await _period(db_pool, owner))["current_period_start"]

    await payments._upgrade_subscription(owner, plan, f"ref_{owner}_early", 500_000, "NGN")

    row = await _period(db_pool, owner)
    assert _close_to(row["current_period_end"], NOW + 40 * DAY)
    assert row["current_period_start"] == started  # the current period continues


async def test_renewing_in_grace_continues_from_the_old_end(
    seeded_domain, db_pool, make_plan, no_receipts
):
    plan = await make_plan()
    owner = await _owner(db_pool, seeded_domain)
    old_end = NOW - 2 * DAY
    await _subscribe(db_pool, owner, plan, old_end)

    await payments._upgrade_subscription(owner, plan, f"ref_{owner}_grace", 500_000, "NGN")

    row = await _period(db_pool, owner)
    assert _close_to(row["current_period_end"], old_end + 30 * DAY)
    assert _close_to(row["current_period_start"], old_end)


async def test_paying_after_it_lapsed_starts_a_new_period(
    seeded_domain, db_pool, make_plan, no_receipts
):
    plan = await make_plan()
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, plan, NOW - 20 * DAY)

    await payments._upgrade_subscription(owner, plan, f"ref_{owner}_late", 500_000, "NGN")

    row = await _period(db_pool, owner)
    assert _close_to(row["current_period_end"], NOW + 30 * DAY)
    assert (await plan_service.for_user(owner)).name == plan


async def test_a_different_plan_starts_a_new_period(seeded_domain, db_pool, make_plan, no_receipts):
    old, new = await make_plan(), await make_plan(price=9000)
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, old, NOW + 10 * DAY)

    await payments._upgrade_subscription(owner, new, f"ref_{owner}_switch", 900_000, "NGN")

    row = await _period(db_pool, owner)
    assert row["plan"] == new
    assert _close_to(row["current_period_end"], NOW + 30 * DAY)


async def test_a_yearly_plan_buys_a_year(seeded_domain, db_pool, make_plan, no_receipts):
    plan = await make_plan(interval="yearly")
    owner = await _owner(db_pool, seeded_domain)

    await payments._upgrade_subscription(owner, plan, f"ref_{owner}_year", 500_000, "NGN")

    assert _close_to((await _period(db_pool, owner))["current_period_end"], NOW + 365 * DAY)


async def test_payment_records_outlive_the_account(db_pool, make_plan, no_receipts):
    plan = await make_plan()
    async with db_pool.acquire() as conn:
        user_id = str(
            await conn.fetchval(
                "INSERT INTO users (email, name) VALUES ($1, 'Gone') RETURNING id",
                f"gone-{plan}@example.invalid",
            )
        )
    reference = f"ref_{plan}_gone"
    await payments._upgrade_subscription(user_id, plan, reference, 500_000, "NGN")

    async with db_pool.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE id = $1", user_id)
        kept = await conn.fetchrow(
            "SELECT user_id, amount FROM payment_history WHERE paystack_ref = $1", reference
        )
        await conn.execute("DELETE FROM payment_history WHERE paystack_ref = $1", reference)

    assert kept["user_id"] is None and kept["amount"] == 500_000


# ── Reminders ──────────────────────────────────────────────────────────────


@pytest.fixture
def reminders(monkeypatch):
    sent: list[tuple] = []

    async def _send(to, name, plan_name, period_end, grace_days):
        sent.append((to, plan_name, period_end, grace_days))

    monkeypatch.setattr(subscription_reminders, "send_renewal_reminder_email", _send)
    return sent


async def _mine(sent, db_pool, owner):
    async with db_pool.acquire() as conn:
        email = await conn.fetchval("SELECT email FROM users WHERE id = $1", owner)
    return [s for s in sent if s[0] == email]


async def test_owners_are_reminded_once_a_week_before_the_end(
    seeded_domain, db_pool, make_plan, reminders
):
    plan = await make_plan(name="Growth")
    owner = await _owner(db_pool, seeded_domain)
    end = NOW + 6 * DAY
    await _subscribe(db_pool, owner, plan, end)

    await subscription_reminders.send_renewal_reminders()
    await subscription_reminders.send_renewal_reminders()

    mine = await _mine(reminders, db_pool, owner)
    assert len(mine) == 1
    assert mine[0][1] == "Growth" and mine[0][3] == plan_service.GRACE_DAYS


async def test_a_renewed_period_gets_its_own_reminder(seeded_domain, db_pool, make_plan, reminders):
    plan = await make_plan()
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, plan, NOW + 6 * DAY)
    await subscription_reminders.send_renewal_reminders()

    await _subscribe(db_pool, owner, plan, NOW + 5 * DAY + 30 * DAY)  # renewed
    await subscription_reminders.send_renewal_reminders()  # too early for the new one
    await _subscribe(db_pool, owner, plan, NOW + 5 * DAY)  # a week before the new end
    await subscription_reminders.send_renewal_reminders()

    assert len(await _mine(reminders, db_pool, owner)) == 2


@pytest.mark.parametrize("period_end", [NOW + 20 * DAY, NOW - DAY, None])
async def test_no_reminder_outside_the_last_week(
    seeded_domain, db_pool, make_plan, reminders, period_end
):
    plan = await make_plan()
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, plan, period_end)

    await subscription_reminders.send_renewal_reminders()

    assert await _mine(reminders, db_pool, owner) == []


async def test_a_failed_reminder_is_retried(seeded_domain, db_pool, make_plan, monkeypatch):
    plan = await make_plan()
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, plan, NOW + 3 * DAY)
    attempts = []

    async def _flaky(*args):
        attempts.append(args)
        if len(attempts) == 1:
            raise RuntimeError("provider down")

    monkeypatch.setattr(subscription_reminders, "send_renewal_reminder_email", _flaky)
    await subscription_reminders.send_renewal_reminders()
    await subscription_reminders.send_renewal_reminders()

    async with db_pool.acquire() as conn:
        email = await conn.fetchval("SELECT email FROM users WHERE id = $1", owner)
    assert len([a for a in attempts if a[0] == email]) == 2


# ── Data is kept after a lapse ─────────────────────────────────────────────


@pytest.mark.parametrize(
    ("days_since_end", "keeps_paid_retention"),
    [(30, True), (plan_service.GRACE_DAYS + plan_service.LAPSED_RETENTION_HOLD_DAYS + 1, False)],
)
async def test_a_lapsed_account_keeps_its_retention_for_a_while(
    seeded_domain, db_pool, make_plan, days_since_end, keeps_paid_retention
):
    plan = await make_plan()
    async with db_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO data_retention_policies "
            "(plan, events_days, sessions_days, recordings_days, heatmaps_days) "
            "VALUES ($1, 365, 365, 90, 365)",
            plan,
        )
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, plan, NOW - days_since_end * DAY)

    try:
        async with db_pool.acquire() as conn:
            policy = await conn.fetchrow(
                f"SELECT plan, days FROM ({retention_service._domain_policy('events_days')}) dp "
                "WHERE domain_id = $1",
                seeded_domain,
            )
    finally:
        async with db_pool.acquire() as conn:
            await conn.execute("DELETE FROM data_retention_policies WHERE plan = $1", plan)

    assert (policy["plan"] == plan) is keeps_paid_retention
    assert (policy["days"] == 365) is keeps_paid_retention
    # Features follow the period, not the retention hold.
    assert (await plan_service.for_user(owner)).name == "free"


# ── What the billing page is told ─────────────────────────────────────────


@pytest.mark.parametrize(
    ("paid", "granted", "end", "state"),
    [
        ("free", "free", None, "free"),
        ("pro", "pro", NOW + DAY, "active"),
        ("pro", "pro", None, "active"),
        ("pro", "pro", NOW - DAY, "grace"),
        ("pro", "free", NOW - 10 * DAY, "expired"),
    ],
)
def test_billing_state(paid, granted, end, state):
    assert payments._billing_state(paid, granted, end) == state
