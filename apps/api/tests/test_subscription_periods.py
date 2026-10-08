"""Paid plans last for the period that was paid for.

A payment buys a period (30 days for a monthly plan). Access lasts until its end
plus `GRACE_DAYS`, then the account is on the free plan — decided from the dates
on every check, not by a job. Renewing the same plan extends from the current
end; each Paystack payment is applied once; owners are reminded a week before
the end; and a lapsed account's data is kept for a while after.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
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


async def test_upgrading_carries_the_unused_days_over(
    seeded_domain, db_pool, make_plan, no_receipts
):
    # 10 days left of a 1,000/month plan are worth 5 days of a 2,000/month plan.
    old, new = await make_plan(price=1000), await make_plan(price=2000)
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, old, NOW + 10 * DAY)

    await payments._upgrade_subscription(owner, new, f"ref_{owner}_up", 200_000, "NGN")

    row = await _period(db_pool, owner)
    assert row["plan"] == new
    assert _close_to(row["current_period_start"], NOW)
    assert _close_to(row["current_period_end"], NOW + 35 * DAY)
    assert (await plan_service.for_user(owner)).name == new  # switched at once


def _def(plan_id, price, interval="monthly"):
    return plan_catalog.PlanDef(id=plan_id, name=plan_id, price=price, interval=interval)


@pytest.mark.parametrize(
    ("current", "bought", "previous", "expected"),
    [
        # Downgrade: 10 days of 2,000/month buy 20 days of 1,000/month.
        (("big", NOW + 10 * DAY), _def("small", 1000), _def("big", 2000), (NOW, NOW + 50 * DAY)),
        # Monthly to yearly: 15 days of 3,000/30d are 1,500 of 36,500/365d = 15 days.
        (
            ("m", NOW + 15 * DAY),
            _def("y", 36_500, "yearly"),
            _def("m", 3000),
            (NOW, NOW + 380 * DAY),
        ),
        # Switching during grace: nothing left to carry over.
        (("big", NOW - DAY), _def("small", 1000), _def("big", 2000), (NOW, NOW + 30 * DAY)),
        # The old plan was deleted: no price to convert, a fresh period.
        (("gone", NOW + 10 * DAY), _def("small", 1000), None, (NOW, NOW + 30 * DAY)),
        # No subscription yet.
        (None, _def("small", 1000), None, (NOW, NOW + 30 * DAY)),
    ],
)
def test_next_period(current, bought, previous, expected):
    row = (
        {
            "plan": current[0],
            "status": "active",
            "current_period_start": current[1] - 30 * DAY,
            "current_period_end": current[1],
        }
        if current
        else None
    )

    start, end = plan_service.next_period(row, bought, previous, NOW)

    assert _close_to(start, expected[0]) and _close_to(end, expected[1])


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


# ── Lifecycle emails ───────────────────────────────────────────────────────


@pytest.fixture
def notices(monkeypatch):
    sent: list[dict] = []

    async def _send(to, name, kind, **details):
        sent.append({"to": to, "kind": kind, **details})

    monkeypatch.setattr(subscription_reminders, "send_subscription_notice_email", _send)
    return sent


async def _mine(sent, db_pool, owner):
    async with db_pool.acquire() as conn:
        email = await conn.fetchval("SELECT email FROM users WHERE id = $1", owner)
    return [s for s in sent if s["to"] == email]


@pytest.mark.parametrize(
    ("period_end", "kind"),
    [
        (NOW + 20 * DAY, None),  # too early
        (NOW + 6 * DAY, "renew_7d"),
        (NOW + 12 * timedelta(hours=1), "renew_1d"),
        (NOW - DAY, "grace_started"),
        (NOW - (plan_service.GRACE_DAYS + 1) * DAY, "downgraded"),
        (NOW - 60 * DAY, None),  # lapsed long ago: not emailed now
        (None, None),  # no end date
    ],
)
async def test_each_stage_gets_its_email_once(
    seeded_domain, db_pool, make_plan, notices, period_end, kind
):
    plan = await make_plan(name="Growth")
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, plan, period_end)

    await subscription_reminders.send_subscription_notices()
    await subscription_reminders.send_subscription_notices()

    mine = await _mine(notices, db_pool, owner)
    assert [m["kind"] for m in mine] == ([kind] if kind else [])
    if kind:
        assert mine[0]["plan_name"] == "Growth"
        assert mine[0]["grace_days"] == plan_service.GRACE_DAYS


async def test_the_downgrade_email_counts_paused_sites(seeded_domain, db_pool, make_plan, notices):
    plan = await make_plan()
    owner = await _owner(db_pool, seeded_domain)
    async with db_pool.acquire() as conn:
        for i in range(2):
            await conn.execute(
                "INSERT INTO domains (user_id, domain, name, tracking_id) VALUES ($1, $2, $2, $3)",
                owner,
                f"extra{i}.example.invalid",
                f"trk_{owner[:8]}_{i}",
            )
    await _subscribe(db_pool, owner, plan, NOW - (plan_service.GRACE_DAYS + 1) * DAY)

    await subscription_reminders.send_subscription_notices()

    free = await plan_catalog.get("free")
    (mine,) = await _mine(notices, db_pool, owner)
    assert mine["paused_sites"] == 3 - free.domains_limit


async def test_a_renewed_period_starts_the_emails_over(seeded_domain, db_pool, make_plan, notices):
    plan = await make_plan()
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, plan, NOW + 6 * DAY)
    await subscription_reminders.send_subscription_notices()

    await _subscribe(db_pool, owner, plan, NOW + 5 * DAY)  # renewed: a new end
    await subscription_reminders.send_subscription_notices()

    assert [m["kind"] for m in await _mine(notices, db_pool, owner)] == ["renew_7d"] * 2


async def test_a_failed_email_is_retried(seeded_domain, db_pool, make_plan, monkeypatch):
    plan = await make_plan()
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, plan, NOW + 3 * DAY)
    attempts = []

    async def _flaky(to, *args, **kwargs):
        attempts.append(to)
        if len(attempts) == 1:
            raise RuntimeError("provider down")

    monkeypatch.setattr(subscription_reminders, "send_subscription_notice_email", _flaky)
    await subscription_reminders.send_subscription_notices()
    await subscription_reminders.send_subscription_notices()

    async with db_pool.acquire() as conn:
        email = await conn.fetchval("SELECT email FROM users WHERE id = $1", owner)
    assert attempts.count(email) == 2


@pytest.mark.parametrize("kind", ["renew_7d", "renew_1d", "grace_started", "downgraded"])
async def test_every_notice_renders(monkeypatch, kind):
    from app.services import email_service

    captured = {}

    async def _capture(to, subject, html, text=""):
        captured.update(subject=subject, html=html, text=text)

    monkeypatch.setattr(email_service, "send_email_or_raise", _capture)
    await email_service.send_subscription_notice_email(
        "a@example.invalid",
        "Ada <script>",
        kind,
        plan_name="Pro",
        period_end=NOW,
        grace_days=3,
        paused_sites=2,
    )

    assert "Pro" in captured["subject"] or "Hobby" in captured["subject"]
    assert "<script>" not in captured["html"]  # names are escaped
    assert "<a " not in captured["text"]
    if kind == "downgraded":
        assert "2 of your sites stopped collecting" in captured["html"]


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


# ── Sites over the website limit ───────────────────────────────────────────


async def _add_sites(db_pool, owner, count):
    ids = []
    async with db_pool.acquire() as conn:
        for i in range(count):
            ids.append(
                str(
                    await conn.fetchval(
                        "INSERT INTO domains (user_id, domain, name, tracking_id, created_at) "
                        "VALUES ($1, $2, $2, $3, NOW() + make_interval(secs => $4)) RETURNING id",
                        owner,
                        f"site{i}.example.invalid",
                        f"trk_{owner[:8]}_s{i}",
                        i + 1,
                    )
                )
            )
    return ids


@pytest.fixture
def fresh_site_cache():
    plan_service.clear_local_quota_cache()
    yield
    plan_service.clear_local_quota_cache()


async def test_sites_over_the_limit_pause_when_the_plan_lapses(
    seeded_domain, db_pool, make_plan, fresh_site_cache
):
    plan = await make_plan(domains_limit=3)
    owner = await _owner(db_pool, seeded_domain)
    extra = await _add_sites(db_pool, owner, 2)
    await _subscribe(db_pool, owner, plan, NOW + 5 * DAY)

    assert await plan_service.collecting_site_ids(owner) is None  # all 3 collect

    await _subscribe(db_pool, owner, plan, NOW - 10 * DAY)  # lapsed: back on free
    free = await plan_catalog.get("free")
    collecting = await plan_service.collecting_site_ids(owner)

    oldest_first = [seeded_domain, *extra]
    assert collecting == set(oldest_first[: free.domains_limit])
    assert await plan_service.site_paused(owner, extra[-1]) is True
    assert await plan_service.site_paused(owner, seeded_domain) is False


async def test_the_owner_chooses_which_site_keeps_collecting(
    seeded_domain, db_pool, make_plan, fresh_site_cache
):
    from app.main import app
    from app.middleware.auth import AuthUser, require_auth

    owner = await _owner(db_pool, seeded_domain)
    extra = await _add_sites(db_pool, owner, 2)  # free plan: only the oldest collects
    assert await plan_service.site_paused(owner, extra[1]) is True  # cached answer

    app.dependency_overrides[require_auth] = lambda: AuthUser(
        user_id=owner, email="o@example.invalid"
    )
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://t"
        ) as client:
            chose = await client.post(f"/api/domains/{extra[1]}/keep-active")
            listed = (await client.get("/api/domains")).json()["domains"]
    finally:
        app.dependency_overrides.clear()

    assert chose.status_code == 200
    assert await plan_service.site_paused(owner, extra[1]) is False  # cache dropped
    assert await plan_service.site_paused(owner, seeded_domain) is True
    paused = {d["id"]: d["paused"] for d in listed}
    assert paused == {seeded_domain: True, extra[0]: True, extra[1]: False}
    assert all(d["isOwner"] for d in listed)


async def test_only_the_owner_can_choose(seeded_domain, db_pool):
    from app.main import app
    from app.middleware.auth import AuthUser, require_auth

    app.dependency_overrides[require_auth] = lambda: AuthUser(
        user_id="00000000-0000-4000-8000-000000000009", email="x@example.invalid"
    )
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://t"
        ) as client:
            response = await client.post(f"/api/domains/{seeded_domain}/keep-active")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404


# ── Admin: extend a period ─────────────────────────────────────────────────


async def _admin_post(path, body):
    from app.main import app
    from app.middleware.admin_auth import AdminUser, admin_auth
    from app.middleware.auth import require_auth

    admin = AdminUser(
        user_id="00000000-0000-4000-8000-000000000001", email="a@x.invalid", role="admin"
    )
    app.dependency_overrides[require_auth] = lambda: admin
    app.dependency_overrides[admin_auth] = lambda: admin
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://t"
        ) as client:
            if body is None:
                return await client.get(path)
            return await client.post(path, json=body)
    finally:
        app.dependency_overrides.clear()


async def _sub_id(db_pool, owner):
    async with db_pool.acquire() as conn:
        return str(await conn.fetchval("SELECT id FROM subscriptions WHERE user_id = $1", owner))


@pytest.mark.parametrize(
    ("period_end", "expected_end"),
    [
        (NOW + 10 * DAY, NOW + 17 * DAY),  # adds to the current end
        (NOW - 20 * DAY, NOW + 7 * DAY),  # lapsed: from now
    ],
)
async def test_an_admin_can_extend_a_period(
    seeded_domain, db_pool, make_plan, period_end, expected_end
):
    plan = await make_plan()
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, plan, period_end)

    response = await _admin_post(
        f"/api/admin/subscriptions/{await _sub_id(db_pool, owner)}/extend", {"days": 7}
    )

    assert response.status_code == 200, response.json()
    assert response.json()["state"] == "active"
    assert _close_to((await _period(db_pool, owner))["current_period_end"], expected_end)
    assert (await plan_service.for_user(owner)).name == plan


@pytest.mark.parametrize(
    ("period_end", "plan_id", "body", "status"),
    [
        (None, None, {"days": 7}, 400),  # admin grant without an end date
        (NOW + DAY, "free", {"days": 7}, 400),
        (NOW + DAY, None, {"days": 0}, 400),
        (NOW + DAY, None, {"days": 400}, 400),
        (NOW + DAY, None, {"days": "7"}, 400),
    ],
)
async def test_extending_refuses_what_it_cannot_do(
    seeded_domain, db_pool, make_plan, period_end, plan_id, body, status
):
    plan = plan_id or await make_plan()
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, plan, period_end)

    response = await _admin_post(
        f"/api/admin/subscriptions/{await _sub_id(db_pool, owner)}/extend", body
    )

    assert response.status_code == status


async def test_the_admin_list_shows_each_subscriptions_state(seeded_domain, db_pool, make_plan):
    plan = await make_plan()
    owner = await _owner(db_pool, seeded_domain)
    await _subscribe(db_pool, owner, plan, NOW - DAY)

    response = await _admin_post(f"/api/admin/subscriptions/?plan={plan}", None)

    (row,) = response.json()["subscriptions"]
    assert row["state"] == "grace"
    assert row["grace_ends_at"]
