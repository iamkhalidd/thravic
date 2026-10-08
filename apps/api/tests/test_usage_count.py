"""Usage counts come from `events` — nothing ever wrote `usage_logs`.

`GET /api/payments/usage` summed `usage_logs`, and `/current` read
`subscriptions.events_used`; no code writes either, so both reported 0 forever.
Skipped unless `THRAVIC_TEST_DATABASE_URL` is set.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from app.services import event_service, plan_service, session_service
from tests.conftest import requires_test_db
from tests.test_event_ingestion import _tracker_payload

pytestmark = requires_test_db


async def test_counts_this_periods_events_across_the_users_domains(seeded_domain, db_pool):
    payload = _tracker_payload(seeded_domain)
    await session_service.upsert(payload)
    events = [{**payload, "eventId": str(uuid.uuid4())} for _ in range(3)]
    await event_service.batch_insert(events)

    async with db_pool.acquire() as conn:
        user_id = await conn.fetchval("SELECT user_id FROM domains WHERE id = $1", seeded_domain)
        # Last month's event does not count.
        await conn.execute(
            "UPDATE events SET created_at = date_trunc('month', NOW()) - INTERVAL '1 day' "
            "WHERE event_id = $1",
            events[0]["eventId"],
        )

    # Without a paid plan the period is the calendar month.
    assert await plan_service.events_this_period(str(user_id)) == 2


async def test_a_paid_plan_counts_from_its_billing_cycle(seeded_domain, db_pool, make_plan):
    plan = await make_plan()
    payload = _tracker_payload(seeded_domain)
    await session_service.upsert(payload)
    events = [{**payload, "eventId": str(uuid.uuid4())} for _ in range(3)]
    await event_service.batch_insert(events)

    async with db_pool.acquire() as conn:
        user_id = await conn.fetchval("SELECT user_id FROM domains WHERE id = $1", seeded_domain)
        # Paid 35 days ago: this cycle began 5 days ago.
        await conn.execute(
            "INSERT INTO subscriptions (user_id, plan, status, events_limit, domains_limit, "
            "current_period_start, current_period_end) VALUES ($1, $2, 'active', 0, 0, "
            "NOW() - INTERVAL '35 days', NOW() + INTERVAL '25 days')",
            user_id,
            plan,
        )
        await conn.execute(
            "UPDATE events SET created_at = NOW() - INTERVAL '6 days' WHERE event_id = $1",
            events[0]["eventId"],
        )

    assert await plan_service.events_this_period(str(user_id)) == 2


@pytest.mark.parametrize(
    ("anchor", "now", "window"),
    [
        # No paid plan: the calendar month.
        (None, datetime(2026, 10, 8, tzinfo=UTC), ((2026, 10, 1), (2026, 11, 1))),
        (None, datetime(2026, 12, 31, tzinfo=UTC), ((2026, 12, 1), (2027, 1, 1))),
        # Paid on Sep 20: 30-day cycles from then.
        (
            datetime(2026, 9, 20, tzinfo=UTC),
            datetime(2026, 10, 8, tzinfo=UTC),
            ((2026, 9, 20), (2026, 10, 20)),
        ),
        (
            datetime(2026, 9, 20, tzinfo=UTC),
            datetime(2026, 10, 25, tzinfo=UTC),
            ((2026, 10, 20), (2026, 11, 19)),
        ),
    ],
)
def test_usage_window(anchor, now, window):
    start, resets = plan_service.usage_window(anchor, now)

    assert (start, resets) == tuple(datetime(*d, tzinfo=UTC) for d in window)
