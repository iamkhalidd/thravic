"""Postgres round-trip for the heatmap viewport filter.

Heatmap clicks carry no viewport size of their own; the device class comes from
the click's session (`sessions.screen_width`), bucketed like the analytics devices
breakdown. Skipped unless `THRAVIC_TEST_DATABASE_URL` is set.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from app.services import event_service, session_service
from tests.conftest import requires_test_db
from tests.test_event_ingestion import _tracker_payload

pytestmark = requires_test_db


async def _click_from(domain_id: str, screen_width: int) -> str:
    payload = {
        **_tracker_payload(domain_id),
        "type": "click",
        "screenWidth": screen_width,
        "eventId": str(uuid.uuid4()),
        "data": {"x": 10, "y": 20},
    }
    await session_service.upsert(payload)
    await event_service.batch_insert([payload])
    return payload["sessionId"]


async def test_heatmap_events_filter_by_device(seeded_domain, db_pool):
    await _click_from(seeded_domain, 390)
    await _click_from(seeded_domain, 800)
    await _click_from(seeded_domain, 1024)  # the tablet/desktop boundary is desktop

    end = datetime.now(UTC) + timedelta(minutes=1)
    start = end - timedelta(days=1)

    async def widths(device):
        events = await event_service.query_for_heatmap(seeded_domain, start, end, "click", device)
        async with db_pool.acquire() as conn:
            return sorted(
                [
                    await conn.fetchval(
                        "SELECT screen_width FROM sessions WHERE id = $1", e["session_id"]
                    )
                    for e in events
                ]
            )

    assert await widths(None) == [390, 800, 1024]
    assert await widths("mobile") == [390]
    assert await widths("tablet") == [800]
    assert await widths("desktop") == [1024]
