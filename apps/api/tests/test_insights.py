"""AI insights: facts from the database, the model's answer checked against them,
rule fallback, and one stored report per day with capped refreshes.

The facts tests need `THRAVIC_TEST_DATABASE_URL`; the checking tests do not.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.config import get_settings
from app.services import funnel_service, insight_facts, insight_service
from tests.conftest import requires_test_db

NOW = datetime.now(UTC).replace(microsecond=0)
SITE = "https://shop.example.invalid"


# ── Seeding ────────────────────────────────────────────────────────────────


async def _visit(
    conn,
    domain_id,
    started_at,
    pages,
    *,
    source_type="organic",
    referrer="https://www.google.com/",
    extra_events=(),
):
    """One visitor, one session, a pageview per path a minute apart."""
    visitor = await conn.fetchval(
        "INSERT INTO visitors (visitor_id, domain_id) VALUES ($1, $2) RETURNING id",
        str(uuid.uuid4()),
        domain_id,
    )
    session = await conn.fetchval(
        """
        INSERT INTO sessions (session_id, visitor_id, domain_id, started_at, pageviews,
                              source_type, referrer, screen_width)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 1440) RETURNING id
        """,
        str(uuid.uuid4()),
        visitor,
        domain_id,
        started_at,
        len(pages),
        source_type,
        referrer,
    )
    for i, path in enumerate(pages):
        await conn.execute(
            """
            INSERT INTO events (domain_id, session_id, visitor_id, type, url, created_at)
            VALUES ($1, $2, $3, 'pageview', $4, $5)
            """,
            domain_id,
            session,
            visitor,
            SITE + path,
            started_at + timedelta(minutes=i),
        )
    for path, data in extra_events:
        await conn.execute(
            """
            INSERT INTO events (domain_id, session_id, visitor_id, type, url, data, created_at)
            VALUES ($1, $2, $3, 'custom', $4, $5, $6)
            """,
            domain_id,
            session,
            visitor,
            SITE + path,
            data,
            started_at + timedelta(seconds=30),
        )


async def _seed_week(db_pool, domain_id):
    """Previous week: 60 search visits. This week: the same 60 search visits,
    50 one-page social visits to /pricing (with JS errors), and 10 deeply engaged
    newsletter visits. A funnel / → /signup runs over the search visits."""
    this_week = NOW - timedelta(days=3)
    last_week = NOW - timedelta(days=10)
    async with db_pool.acquire() as conn:
        for i in range(60):
            signed_up = ["/", "/signup"] if i < 10 else ["/", "/features"]
            await _visit(conn, domain_id, last_week + timedelta(minutes=i * 5), ["/", "/features"])
            await _visit(conn, domain_id, this_week + timedelta(minutes=i * 5), signed_up)
        for i in range(50):
            errors = (
                [("/pricing", {"event": "error", "message": "price is undefined"})] if i < 4 else []
            )
            await _visit(
                conn,
                domain_id,
                this_week + timedelta(minutes=i * 5 + 1),
                ["/pricing"],
                source_type="social",
                referrer="https://facebook.com/",
                extra_events=errors,
            )
        for i in range(10):
            await _visit(
                conn,
                domain_id,
                this_week + timedelta(minutes=i * 5 + 2),
                ["/", "/a", "/b", "/c", "/d", "/e"],
                source_type="referral",
                referrer="https://news.example.org/",
            )
    await funnel_service.create(
        domain_id,
        "Signup",
        "",
        [
            {"name": "Home", "type": "pageview", "matchType": "exact", "matchValue": "/"},
            {"name": "Signup", "type": "pageview", "matchType": "exact", "matchValue": "/signup"},
        ],
    )


def _kind(facts, kind):
    return [f for f in facts if f["kind"] == kind]


# ── Facts (Postgres) ───────────────────────────────────────────────────────


@requires_test_db
async def test_facts_cover_all_five_kinds(seeded_domain, db_pool):
    await _seed_week(db_pool, seeded_domain)

    sheet = await insight_facts.build({"id": seeded_domain}, NOW)
    facts = sheet.facts

    overview = _kind(facts, "overview")[0]["numbers"]
    assert overview["sessions"] == 120 and overview["sessionsBefore"] == 60
    assert overview["sessionsChangePct"] == 100

    drivers = {f["subject"]: f["numbers"] for f in _kind(facts, "driver")}
    assert drivers["Sessions from channel “social”"]["sessionsDelta"] == 50
    assert drivers["Sessions from referrer “facebook.com”"]["sessions"] == 50

    page = _kind(facts, "page")[0]
    assert page["subject"] == "Landing page /pricing"
    assert page["numbers"]["entries"] == 50 and page["numbers"]["bounceRatePct"] == 100.0

    technical = _kind(facts, "technical")[0]
    assert "price is undefined" in technical["subject"] and technical["numbers"]["errors"] == 4

    funnel = _kind(facts, "funnel")[0]["numbers"]
    assert (
        funnel["entered"] == 70 and funnel["completed"] == 10
    )  # 60 search + 10 newsletter enter at /

    opportunity = _kind(facts, "opportunity")
    assert any("news.example.org" in f["subject"] for f in opportunity)
    assert [f["id"] for f in facts] == [f"F{i}" for i in range(1, len(facts) + 1)]


@requires_test_db
async def test_too_little_traffic_is_reported_as_such(seeded_domain, db_pool, monkeypatch):
    async with db_pool.acquire() as conn:
        await _visit(conn, seeded_domain, NOW - timedelta(days=1), ["/"])
    called = []
    monkeypatch.setattr(insight_service, "ask_model", lambda facts: called.append(facts))

    report = await insight_service.generate({"id": seeded_domain}, "auto", NOW)

    assert report["status"] == "insufficient_data"
    assert report["insights"] == []
    assert called == []  # no model call for a site this small


# ── Checking the model's answer ────────────────────────────────────────────

FACTS = [
    {
        "id": "F1",
        "kind": "overview",
        "subject": "Whole site",
        "link": "/dashboard",
        "numbers": {"sessions": 1200, "sessionsBefore": 1540, "sessionsChangePct": -22},
    },
    {
        "id": "F2",
        "kind": "driver",
        "subject": "Sessions from referrer “google.com”",
        "link": "/dashboard/sources",
        "numbers": {"sessions": 400, "sessionsBefore": 740, "sessionsDelta": -340},
    },
]


def _insight(**overrides):
    item = {
        "type": "traffic",
        "priority": "high",
        "title": "Visits down 22%",
        "description": "Sessions fell from 1,540 to 1200, mostly Google (-340).",
        "recommendation": "Check your Google rankings for the top 3 pages.",
        "facts": ["F1", "F2"],
    }
    return {**item, **overrides}


def test_a_grounded_insight_is_kept():
    kept = insight_service.validate([_insight()], FACTS)

    assert len(kept) == 1 and kept[0]["facts"] == ["F1", "F2"]


def test_an_invented_number_drops_the_insight():
    kept = insight_service.validate([_insight(description="Sessions fell by 31%.")], FACTS)

    assert kept == []


def test_numbers_must_come_from_the_cited_facts():
    # 340 is only in F2, which this insight does not cite.
    kept = insight_service.validate(
        [_insight(description="Google sent 340 fewer.", facts=["F1"])], FACTS
    )

    assert kept == []


@pytest.mark.parametrize(
    "bad",
    [{"facts": []}, {"facts": ["F9"]}, {"type": "astrology"}, {"title": ""}],
)
def test_malformed_insights_are_dropped(bad):
    assert insight_service.validate([_insight(**bad)], FACTS) == []


def test_rules_write_specific_insights_from_the_same_facts():
    out = insight_service.rule_insights(FACTS)

    assert out[0]["type"] == "traffic"
    assert "1200" in out[0]["description"] and "google.com" in out[0]["description"]
    assert insight_service.validate(out, FACTS) == out  # rules pass the same check


# ── The model call ─────────────────────────────────────────────────────────


@pytest.fixture
def model(monkeypatch):
    """Stub the OpenAI-compatible endpoint; returns the requests it received."""
    seen: list[httpx.Request] = []
    reply = {"insights": [_insight()]}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(reply)}}]})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        insight_service.httpx,
        "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw),
    )
    settings = get_settings()
    monkeypatch.setattr(settings, "AI_API_KEY", "sk-test")
    monkeypatch.setattr(settings, "AI_BASE_URL", "https://api.deepseek.com/")
    monkeypatch.setattr(settings, "AI_MODEL", "deepseek-flash-test")
    return seen


async def test_the_model_gets_the_facts_and_returns_insights(model):
    raw = await insight_service.ask_model(FACTS)

    request = model[0]
    body = json.loads(request.content)
    assert str(request.url) == "https://api.deepseek.com/chat/completions"
    assert request.headers["authorization"] == "Bearer sk-test"
    assert body["model"] == "deepseek-flash-test"
    assert body["response_format"] == {"type": "json_object"}
    assert '"F2"' in body["messages"][1]["content"]
    assert raw == [_insight()]


async def test_without_a_key_the_model_is_not_called(monkeypatch):
    monkeypatch.setattr(get_settings(), "AI_API_KEY", None)

    assert await insight_service.ask_model(FACTS) is None


async def test_a_failed_model_call_falls_back(monkeypatch):
    def handler(request):
        return httpx.Response(400, json={"error": {"message": "Model Not Exist"}})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        insight_service.httpx,
        "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw),
    )
    monkeypatch.setattr(get_settings(), "AI_API_KEY", "sk-test")

    assert await insight_service.ask_model(FACTS) is None


# ── Stored reports ─────────────────────────────────────────────────────────


@requires_test_db
async def test_one_report_a_day_and_capped_refreshes(seeded_domain, db_pool, model):
    await _seed_week(db_pool, seeded_domain)
    domain = {"id": seeded_domain}

    first = await insight_service.todays_report(domain)
    again = await insight_service.todays_report(domain)

    assert again["id"] == first["id"]
    assert len(model) == 1  # one model call for both views
    assert first["status"] == "ok"

    for _ in range(insight_service.MAX_REFRESHES_PER_DAY):
        assert await insight_service.refresh(domain) is not None
    assert await insight_service.refresh(domain) is None

    response = await insight_service.to_response(
        await insight_service.todays_report(domain), seeded_domain
    )
    assert response["refreshesLeft"] == 0
    assert response["insights"][0]["evidence"][0]["subject"]
    assert response["insights"][0]["link"].startswith("/dashboard")
