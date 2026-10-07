"""Traffic source classification and the referrer / page / series queries.

The DB tests are skipped unless `THRAVIC_TEST_DATABASE_URL` is set.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.routers.funnels import _funnel_progress
from app.services import event_service, session_service
from app.services.session_service import classify_source
from tests.conftest import requires_test_db
from tests.test_event_ingestion import _tracker_payload


@pytest.mark.parametrize(
    ("referrer", "utm_source", "utm_medium", "own", "expected"),
    [
        ("https://www.google.com/search?q=x", None, None, None, "organic"),
        ("https://site.example/pricing", None, None, "site.example", "direct"),  # own site
        ("https://blog.site.example/", None, None, "www.site.example", "direct"),
        ("https://news.ycombinator.com/", None, None, "site.example", "referral"),
        (None, "facebook", "social", None, "social"),
        (None, "facebook", None, None, "social"),
        (None, "weekly", "newsletter", None, "email"),
        (None, "google", "cpc", None, "paid"),
        (None, "partner", "banner", None, "paid"),
        (None, None, None, None, "direct"),
    ],
)
def test_classify_source(referrer, utm_source, utm_medium, own, expected):
    assert classify_source(referrer, utm_source, utm_medium, own) == expected


def test_funnel_steps_count_only_in_order():
    t0 = datetime(2026, 1, 1, tzinfo=UTC)
    steps = [
        {"type": "pageview", "match_type": "exact", "match_value": "/a"},
        {"type": "pageview", "match_type": "exact", "match_value": "/b"},
    ]

    def view(visitor, path, minute):
        return {"type": "pageview", "url": f"https://s.example{path}?utm=x",
                "visitor_id": visitor, "created_at": t0 + timedelta(minutes=minute)}

    events = [
        view("in-order", "/a", 0), view("in-order", "/b", 1),
        view("skipped-a", "/b", 0),                     # never counted for step 2
        view("wrong-order", "/b", 0), view("wrong-order", "/a", 1),
    ]

    assert _funnel_progress(steps, events) == [2, 1]


async def _visit(domain_id, referrer=None, path="/landing", sessions=None):
    payload = {**_tracker_payload(domain_id), "referrer": referrer,
               "url": f"https://ingest.example.invalid{path}?utm_campaign=x"}
    if sessions is not None:
        payload["sessionId"] = sessions
    await session_service.upsert(payload)
    await event_service.batch_insert([{**payload, "eventId": str(uuid.uuid4())}])
    return payload


@requires_test_db
async def test_top_referrers_group_by_site_and_skip_the_site_itself(seeded_domain, db_pool):
    await _visit(seeded_domain, "https://www.google.com/search?q=a")
    await _visit(seeded_domain, "https://google.com/")
    await _visit(seeded_domain, "https://ingest.example.invalid/other")
    end = datetime.now(UTC) + timedelta(minutes=1)

    rows = await session_service.get_top_referrers(
        seeded_domain, end - timedelta(days=1), end, 10, "ingest.example.invalid"
    )

    assert [(r["site"], r["sessions"]) for r in rows] == [("google.com", 2)]


@requires_test_db
async def test_page_stats_group_by_path(seeded_domain, db_pool):
    session = str(uuid.uuid4())
    await _visit(seeded_domain, path="/landing", sessions=session)
    await _visit(seeded_domain, path="/pricing", sessions=session)
    await _visit(seeded_domain, path="/landing")  # another visitor, bounces
    end = datetime.now(UTC) + timedelta(minutes=1)

    stats = {r["path"]: r for r in await event_service.get_page_stats(
        seeded_domain, end - timedelta(days=1), end
    )}

    assert stats["/landing"]["views"] == 2
    assert stats["/landing"]["entries"] == 2 and stats["/landing"]["bounces"] == 1
    assert stats["/pricing"]["exits"] == 1


@requires_test_db
async def test_timeseries_fills_empty_days_with_iso_dates(seeded_domain, db_pool):
    await _visit(seeded_domain)
    end = datetime.now(UTC)

    rows = await event_service.get_timeseries(seeded_domain, end - timedelta(days=6), end)

    assert len(rows) == 7
    assert rows[-1]["pageviews"] == 1 and rows[0]["pageviews"] == 0
    datetime.fromisoformat(rows[0]["bucket"].replace("Z", "+00:00"))  # parseable everywhere
    assert rows[0]["bucket"].endswith("Z")
