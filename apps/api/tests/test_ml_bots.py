"""Bot filtering: the rules, the per-visit score, the collect hook and the hourly check."""

from __future__ import annotations

import uuid

import pytest

from app.ml import bots
from app.routers import collect as collect_routes
from app.services import bot_service
from tests.test_collect import TRACKING_ID, _pageview, client, domain, writes  # noqa: F401

CHROME = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)


# ── Rules ────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "ua",
    [
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0 Safari/537.36",
        "curl/8.4.0",
        "python-requests/2.31",
        "",
        None,
    ],
)
def test_bot_user_agents_are_caught(ua):
    assert bots.is_bot_user_agent(ua)


@pytest.mark.parametrize(
    "ua",
    [
        CHROME,
        # A CUBOT phone: "bot" inside a word, not a crawler.
        "Mozilla/5.0 (Linux; Android 12; CUBOT KINGKONG 7) AppleWebKit/537.36 Chrome/118.0 Mobile",
    ],
)
def test_people_are_not_bots(ua):
    assert not bots.is_bot_user_agent(ua)


def test_spam_referrers_match_the_host_and_its_subdomains():
    assert bots.is_spam_referrer("https://semalt.com/page")
    assert bots.is_spam_referrer("http://www.semalt.com/")
    assert not bots.is_spam_referrer("https://notsemalt.com/")
    assert not bots.is_spam_referrer("https://www.google.com/")
    assert not bots.is_spam_referrer(None)


def test_rule_reason():
    assert bots.rule_reason("curl/8.0", None) == "bot_user_agent"
    assert bots.rule_reason(CHROME, "https://semalt.com/") == "spam_referrer"
    assert bots.rule_reason(CHROME, "https://www.google.com/") is None


# ── Score ────────────────────────────────────────────────────────────────────


def _visit(**overrides) -> bots.Signals:
    values = {
        "user_agent": CHROME,
        "referrer": None,
        "screen_width": 1440,
        "pageview_times": [0.0, 20.0, 55.0],
        "interactions": 4,
    }
    values.update(overrides)
    return bots.Signals(**values)


def test_a_normal_visit_is_not_flagged():
    total, reasons = bots.score(_visit())
    assert total == 0 and reasons == []
    assert not bots.is_bot(_visit())


def test_pages_faster_than_anyone_reads_are_flagged():
    visit = _visit(pageview_times=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0])
    assert "too_fast" in bots.score(visit)[1]
    assert bots.is_bot(visit)


def test_no_interaction_alone_does_not_flag():
    visit = _visit(pageview_times=[i * 30.0 for i in range(12)], interactions=0)
    total, reasons = bots.score(visit)
    assert reasons == ["no_interaction"]
    assert total < bots.FLAG_SCORE


def test_no_interaction_with_repeated_visits_flags():
    visit = _visit(
        pageview_times=[i * 30.0 for i in range(12)], interactions=0, visitor_visits_today=40
    )
    assert bots.is_bot(visit)


def test_no_interaction_does_not_count_when_the_site_does_not_track_it():
    visit = _visit(
        pageview_times=[i * 30.0 for i in range(12)],
        interactions=0,
        tracks_interactions=False,
    )
    assert "no_interaction" not in bots.score(visit)[1]


def test_no_screen_alone_does_not_flag():
    assert not bots.is_bot(_visit(screen_width=None))


# ── Collect hook ─────────────────────────────────────────────────────────────


@pytest.fixture
def hits(monkeypatch):
    recorded: list[tuple] = []

    async def _record_hit(domain_id, reason, user_agent, hits=1):
        recorded.append((reason, hits))

    monkeypatch.setattr(bot_service, "record_hit", _record_hit)
    return recorded


def test_a_bot_request_is_counted_and_not_stored(client, domain, writes, hits):  # noqa: F811
    response = client.post(
        f"/api/collect/{TRACKING_ID}",
        json=_pageview(),
        headers={"User-Agent": "curl/8.4.0"},
    )
    assert response.status_code == 202
    assert response.json()["dropped"] == collect_routes.BOT_TRAFFIC
    assert writes.sessions == [] and writes.events == []
    assert hits == [("bot_user_agent", 1)]


def test_the_batch_route_drops_spam_referrer_events(client, domain, writes, hits):  # noqa: F811
    spam = [_pageview(referrer="https://semalt.com/") for _ in range(2)]
    response = client.post(
        f"/api/collect/{TRACKING_ID}/batch", json={"events": [*spam, _pageview()]}
    )
    assert response.status_code in (200, 202)
    stored = [event for batch in writes.events for event in batch]
    assert len(stored) == 1
    assert hits == [("spam_referrer", 2)]


def test_app_traffic_is_never_dropped_by_the_rules(client, domain, writes, hits):  # noqa: F811
    domain["platform"] = "ios"
    response = client.post(
        f"/api/collect/{TRACKING_ID}", json=_pageview(), headers={"User-Agent": "curl/8.4.0"}
    )
    assert response.json().get("dropped") != collect_routes.BOT_TRAFFIC
    assert hits == []


# ── Hourly check ─────────────────────────────────────────────────────────────


def _row(**overrides):
    row = {
        "id": uuid.uuid4(),
        "user_agent": CHROME,
        "referrer": None,
        "screen_width": 1440,
        "times": [0.0, 20.0, 55.0],
        "interactions": 3,
        "visits": 1,
    }
    row.update(overrides)
    return row


async def test_check_domain_moves_bots_and_marks_people(monkeypatch):
    bot = _row(user_agent="Googlebot/2.1")
    person = _row()
    calls: list[tuple[str, tuple]] = []

    async def _query(sql, *args):
        calls.append((sql, args))
        return [bot, person] if sql is bot_service._CANDIDATES_SQL else []

    monkeypatch.setattr(bot_service, "query", _query)
    result = await bot_service.check_domain({"id": uuid.uuid4(), "domain": "example.com"})

    assert result == {"checked": 2, "flagged": 1}
    moved = [args for sql, args in calls if sql is bot_service._QUARANTINE_SQL]
    assert [args[0] for args in moved] == [bot["id"]]
    assert "bot_user_agent" in moved[0][3]
    marked = [args for sql, args in calls if sql.startswith("UPDATE sessions")]
    assert marked == [([person["id"]],)]


async def test_check_domain_skips_apps(monkeypatch):
    async def _query(*_args):
        raise AssertionError("apps are not checked")

    monkeypatch.setattr(bot_service, "query", _query)
    result = await bot_service.check_domain({"id": uuid.uuid4(), "platform": "android"})
    assert result == {"checked": 0, "flagged": 0}
