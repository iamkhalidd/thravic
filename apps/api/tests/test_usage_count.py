"""Usage counts come from `events` — nothing ever wrote `usage_logs`.

`GET /api/payments/usage` summed `usage_logs`, and `/current` read
`subscriptions.events_used`; no code writes either, so both reported 0 forever.
Skipped unless `THRAVIC_TEST_DATABASE_URL` is set.
"""

from __future__ import annotations

import uuid

from app.services import event_service, plan_service, session_service
from tests.conftest import requires_test_db
from tests.test_event_ingestion import _tracker_payload

pytestmark = requires_test_db


async def test_counts_this_months_events_across_the_users_domains(seeded_domain, db_pool):
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

    assert await plan_service.events_this_month(str(user_id)) == 2
