"""AI analyst: the breakdown of one change and its ranking, the question parser,
the checks on the model's answer and the rule answer.

The round-trip test at the end needs `THRAVIC_TEST_DATABASE_URL`; the rest do not.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.config import get_settings
from app.services import analyst_service, assistant_service, insight_facts
from tests.conftest import requires_test_db


def _row(dimension, key, now, before, now_bounced=0, before_bounced=0):
    return {
        "dimension": dimension,
        "key": key,
        "now": now,
        "before": before,
        "now_bounced": now_bounced,
        "before_bounced": before_bounced,
    }


# ── Ranking a count ────────────────────────────────────────────────────────


def test_a_drop_is_explained_by_the_segments_that_fell_most():
    rows = [
        _row("total", "all", 60, 100),
        _row("channel", "organic", 10, 45),
        _row("channel", "social", 40, 40),
        _row("channel", "direct", 10, 15),
        _row("device", "mobile", 20, 55),
        _row("device", "desktop", 40, 45),
    ]
    headline, segments = insight_facts.rank_segments(rows)
    assert headline == {"now": 60, "before": 100, "delta": -40, "changePct": -40}
    assert [(s["dimension"], s["key"]) for s in segments] == [
        ("channel", "organic"),
        ("device", "mobile"),
        ("channel", "direct"),
        ("device", "desktop"),
    ]
    organic = segments[0]
    assert organic["delta"] == -35
    assert organic["shareOfChangePct"] == 88  # 35 of the 40 lost
    assert organic["changePct"] == -78
    assert organic["link"] == "/dashboard/traffic/sources"


def test_segments_moving_against_the_change_are_left_out():
    rows = [
        _row("total", "all", 50, 100),
        _row("channel", "organic", 0, 80),
        _row("channel", "social", 50, 20),  # grew while the site fell
    ]
    _, segments = insight_facts.rank_segments(rows)
    assert [s["key"] for s in segments] == ["organic"]
    assert segments[0]["shareOfChangePct"] == 160  # more than all of it, offset by social


def test_tiny_moves_and_empty_keys_are_noise():
    rows = [
        _row("total", "all", 90, 100),
        _row("country", None, 0, 8),
        _row("country", "NG", 88, 90),  # 2 fewer: below MIN_DRIVER_DELTA
        _row("page", "/pricing", 2, 10),
    ]
    _, segments = insight_facts.rank_segments(rows)
    assert [s["key"] for s in segments] == ["/pricing"]


def test_a_segment_that_is_the_whole_site_explains_nothing():
    rows = [
        _row("total", "all", 12, 24),
        _row("page", "/signup", 12, 24),  # every sign-up happens there
        _row("device", "mobile", 0, 12),
    ]
    _, segments = insight_facts.rank_segments(rows)
    assert [s["key"] for s in segments] == ["mobile"]


def test_one_breakdown_cannot_fill_the_list():
    rows = [_row("total", "all", 0, 400)]
    rows += [_row("page", f"/p{i}", 0, 40 - i) for i in range(10)]
    rows += [_row("browser", "Chrome", 0, 30)]
    _, segments = insight_facts.rank_segments(rows)
    pages = [s for s in segments if s["dimension"] == "page"]
    assert len(pages) == insight_facts.MAX_PER_DIMENSION
    assert any(s["key"] == "Chrome" for s in segments)
    assert len(segments) <= insight_facts.MAX_SEGMENTS


def test_with_no_overall_change_the_biggest_movers_either_way_show():
    rows = [
        _row("total", "all", 100, 100),
        _row("channel", "organic", 30, 60),
        _row("channel", "social", 70, 40),
    ]
    headline, segments = insight_facts.rank_segments(rows)
    assert headline["delta"] == 0
    assert {s["key"] for s in segments} == {"organic", "social"}
    assert all(s["shareOfChangePct"] is None for s in segments)


def test_no_rows_at_all_is_no_change():
    headline, segments = insight_facts.rank_segments([])
    assert headline["now"] == 0 and headline["before"] == 0 and segments == []


# ── Ranking the bounce rate ────────────────────────────────────────────────


def test_bounce_rate_parts_add_up_to_the_sites_change():
    rows = [
        _row("total", "all", 200, 200, 120, 80),  # 60% now, 40% before
        _row("device", "mobile", 100, 100, 90, 50),
        _row("device", "desktop", 100, 100, 30, 30),
    ]
    headline, segments = insight_facts.rank_segments(rows, is_rate=True)
    assert headline["now"] == 60.0 and headline["before"] == 40.0 and headline["delta"] == 20.0
    assert [s["key"] for s in segments] == ["mobile"]
    mobile = segments[0]
    assert mobile["effect"] == 20.0  # all of the 20 points
    assert mobile["shareOfChangePct"] == 100
    assert mobile["now"] == 90.0 and mobile["before"] == 50.0 and mobile["delta"] == 40.0


def test_a_segment_that_grew_but_bounces_as_usual_explains_nothing():
    rows = [
        _row("total", "all", 300, 200, 150, 80),  # 50% now, 40% before
        _row("channel", "social", 100, 0, 40, 0),  # new, bounces at the old rate
        _row("channel", "organic", 200, 200, 110, 80),
    ]
    _, segments = insight_facts.rank_segments(rows, is_rate=True)
    assert [s["key"] for s in segments] == ["organic"]


def test_small_segments_are_ignored_for_rates():
    rows = [
        _row("total", "all", 100, 100, 60, 40),
        _row("page", "/tiny", 5, 4, 5, 0),
    ]
    _, segments = insight_facts.rank_segments(rows, is_rate=True)
    assert segments == []


# ── Evidence ───────────────────────────────────────────────────────────────


def _ev(event, page, label=None, now=0, before=0, lcp_now=None, lcp_before=None, samples=0):
    return {
        "event": event, "page": page, "label": label, "now": now, "before": before,
        "lcp_now": lcp_now, "lcp_before": lcp_before, "samples": samples,
        "session_ids": [f"s-{page}-{i}" for i in range(now)],
    }


def test_evidence_keeps_new_and_growing_problems_only():
    rows = [
        _ev("error", "/signup", "TypeError: x is undefined", now=12, before=0),
        _ev("error", "/", "old error", now=5, before=9),  # shrinking
        _ev("error", "/a", "rare", now=1, before=0),  # too few
        _ev("rage_click", "/signup", "Create account", now=4, before=1),
        _ev("performance", "/signup", now=30, lcp_now=4800, lcp_before=2000, samples=30),
        _ev("performance", "/", now=30, lcp_now=4000, lcp_before=3900, samples=30),  # not slower
        _ev("performance", "/b", now=2, lcp_now=9000, lcp_before=None, samples=2),  # few samples
    ]
    picked = insight_facts.pick_evidence(rows)
    assert [p["kind"] for p in picked] == ["error", "rage_click", "slow_page"]
    assert picked[0]["numbers"] == {"visitsAffected": 12, "visitsAffectedBefore": 0}
    assert "/signup" in picked[0]["subject"]
    assert picked[0]["sessions"][:2] == ["s-/signup-0", "s-/signup-1"]
    assert picked[2]["numbers"]["lcpMs"] == 4800


# ── The question ───────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("question", "events", "expected"),
    [
        ("Why did sign-ups drop last week?", ["signup", "purchase"], ("event", "signup")),
        ("why did registrations fall", ["user_signed_up"], ("event", "user_signed_up")),
        ("Why are orders down?", ["checkout_completed"], ("event", "checkout_completed")),
        ("what happened to newsletter_join", ["newsletter_join"], ("event", "newsletter_join")),
        ("why did my sales drop", ["signup"], (None, None)),  # a conversion we can't name
        ("Why is my bounce rate so high?", [], ("bounce_rate", None)),
        ("why so many errors", [], ("errors", None)),
        ("why did page views go up", [], ("pageviews", None)),
        ("traffic dropped yesterday", [], ("visitors", None)),
        ("why are visits down", [], ("sessions", None)),
        ("conversions dropped", ["lead"], ("event", "lead")),
        ("hello", ["lead"], (None, None)),
    ],
)
def test_questions_map_to_a_metric(question, events, expected):
    assert analyst_service.parse_metric(question, events) == expected


# Wednesday 2026-10-28 12:00 UTC; the user is in Lagos (UTC+1, tzOffset -60).
NOW = datetime(2026, 10, 28, 12, 0, tzinfo=UTC)


def _clock(selected=None):
    return assistant_service.Clock(NOW, -60, selected)


def test_last_week_is_the_calendar_week_before_this_one():
    start, end = analyst_service.parse_period("Why did sign-ups drop last week?", _clock())
    # Monday 19 Oct to Monday 26 Oct, Lagos midnight (23:00 UTC the day before).
    assert start == datetime(2026, 10, 18, 23, 0, tzinfo=UTC)
    assert end == datetime(2026, 10, 25, 23, 0, tzinfo=UTC)


def test_other_periods():
    clock = _clock()
    assert analyst_service.parse_period("errors in the last 14 days", clock) == (
        NOW - timedelta(days=14), NOW
    )
    assert analyst_service.parse_period("this week", clock)[0] == datetime(
        2026, 10, 25, 23, 0, tzinfo=UTC
    )
    assert analyst_service.parse_period("yesterday", clock) == (
        datetime(2026, 10, 26, 23, 0, tzinfo=UTC), datetime(2026, 10, 27, 23, 0, tzinfo=UTC)
    )
    assert analyst_service.parse_period("why did traffic drop", clock) is None


def test_period_falls_back_to_the_dashboard_then_seven_days():
    selected = (NOW - timedelta(days=30), NOW)
    assert analyst_service.choose_period("why", _clock(selected), None, None) == selected
    assert analyst_service.choose_period("why", _clock(), None, None) == (
        NOW - timedelta(days=7), NOW
    )
    explicit = (NOW - timedelta(days=2), NOW - timedelta(days=1))
    assert analyst_service.choose_period("last week", _clock(), *explicit) == explicit


# ── The model's answer ─────────────────────────────────────────────────────

FACTS = [
    {"id": "F1", "kind": "change", "subject": "“signup” events, Oct 19 to Oct 26",
     "numbers": {"count": 41, "countBefore": 88, "delta": -47, "changePct": -53}, "link": "/"},
    {"id": "F2", "kind": "segment", "subject": "“signup” events from device “mobile”",
     "numbers": {"count": 6, "countBefore": 50, "delta": -44, "shareOfChangePct": 94},
     "link": "/"},
]


def test_an_answer_using_only_fact_numbers_is_kept():
    raw = {
        "cause": "Sign-ups fell from 88 to 41, and mobile accounts for 94% of the drop.",
        "explanation": "Mobile sign-ups went from 50 to 6.",
        "fixes": ["Try signing up on a phone yourself.", "Watch the recordings below.", "extra"],
        "facts": ["F1", "F2"],
    }
    answer = analyst_service.validate(raw, FACTS, "Why did sign-ups drop last week?")
    assert answer is not None
    assert len(answer["fixes"]) == analyst_service.MAX_FIXES


def test_an_answer_with_an_invented_number_is_dropped():
    raw = {"cause": "Sign-ups fell by 63% on mobile.", "explanation": "", "fixes": ["Fix it."]}
    assert analyst_service.validate(raw, FACTS, "why") is None


def test_an_answer_without_fixes_is_dropped():
    assert analyst_service.validate({"cause": "Mobile.", "fixes": []}, FACTS, "why") is None
    assert analyst_service.validate(["not", "a", "dict"], FACTS, "why") is None


def _explanation(segments, evidence=(), metric="event", event="signup", headline=None):
    return insight_facts.Explanation(
        metric=metric,
        event=event,
        headline=headline or {"now": 41, "before": 88, "delta": -47, "changePct": -53},
        segments=list(segments),
        evidence=list(evidence),
        sessions=[],
        sheet=insight_facts.FactSheet(),
        windows=insight_facts.Windows.ending(NOW),
    )


def test_the_rule_answer_names_the_segment_and_only_uses_its_numbers():
    seg = {"dimension": "device", "key": "mobile", "now": 6, "before": 50, "delta": -44,
           "changePct": -88, "shareOfChangePct": 94, "effect": -44, "link": "/"}
    error = {"kind": "error", "subject": "JavaScript error on /signup: TypeError",
             "numbers": {"visitsAffected": 12, "visitsAffectedBefore": 0},
             "link": "/", "sessions": []}
    answer = analyst_service.rule_answer(_explanation([seg], [error]))
    assert "device “mobile”" in answer["cause"] and "94%" in answer["cause"]
    assert "88" in answer["explanation"] and "41" in answer["explanation"]
    assert "Errors page" in answer["fixes"][0]
    assert any("on mobile" in fix for fix in answer["fixes"])
    facts = FACTS + [{"id": "F3", "kind": "evidence", "subject": error["subject"],
                      "numbers": error["numbers"], "link": "/"}]
    assert analyst_service.validate({**answer, "facts": []}, facts, "") is not None


def test_the_rule_answer_for_a_steady_metric():
    answer = analyst_service.rule_answer(
        _explanation([], headline={"now": 40, "before": 40, "delta": 0, "changePct": 0})
    )
    assert "did not change" in answer["cause"]
    assert answer["fixes"]


# ── Round trip ─────────────────────────────────────────────────────────────


async def _visit(conn, domain_id, started_at, pages, *, width=1440, events=()):
    visitor = await conn.fetchval(
        "INSERT INTO visitors (visitor_id, domain_id) VALUES ($1, $2) RETURNING id",
        str(uuid.uuid4()),
        domain_id,
    )
    session = await conn.fetchval(
        """
        INSERT INTO sessions (session_id, visitor_id, domain_id, started_at, pageviews,
                              source_type, referrer, screen_width, country, user_agent)
        VALUES ($1, $2, $3, $4, $5, 'organic', 'https://www.google.com/', $6, 'NG',
                'Mozilla/5.0 Chrome/120.0 Safari/537.36')
        RETURNING id
        """,
        str(uuid.uuid4()),
        visitor,
        domain_id,
        started_at,
        len(pages),
        width,
    )
    for i, path in enumerate(pages):
        await conn.execute(
            "INSERT INTO events (domain_id, session_id, visitor_id, type, url, created_at) "
            "VALUES ($1, $2, $3, 'pageview', $4, $5)",
            domain_id, session, visitor, f"https://shop.example.invalid{path}",
            started_at + timedelta(minutes=i),
        )
    for name, path, data in events:
        await conn.execute(
            "INSERT INTO events (domain_id, session_id, visitor_id, type, url, data, created_at) "
            "VALUES ($1, $2, $3, 'custom', $4, $5::jsonb, $6)",
            domain_id, session, visitor, f"https://shop.example.invalid{path}",
            {"event": name, **data}, started_at + timedelta(minutes=5),
        )
    return session


@requires_test_db
async def test_sign_ups_lost_on_mobile_after_a_new_error(db_pool, seeded_domain, monkeypatch):
    shop = {"id": seeded_domain}
    monkeypatch.setattr(get_settings(), "AI_API_KEY", "")
    end = datetime.now(UTC).replace(microsecond=0)
    mid = end - timedelta(days=7)
    domain_id = shop["id"]
    async with db_pool.acquire() as conn:
        for i in range(12):  # the week before: mobile and desktop both sign up
            when = mid - timedelta(days=3, minutes=i * 20)
            await _visit(conn, domain_id, when, ["/", "/signup"], width=390,
                         events=[("signup", "/signup", {})])
            await _visit(conn, domain_id, when, ["/", "/signup"],
                         events=[("signup", "/signup", {})])
        for i in range(12):  # this week: mobile hits an error and doesn't sign up
            when = mid + timedelta(days=3, minutes=i * 20)
            session = await _visit(
                conn, domain_id, when, ["/", "/signup"], width=390,
                events=[("error", "/signup", {"message": "TypeError: form is null"})],
            )
            if i < 2:
                await conn.execute(
                    "INSERT INTO session_recordings (domain_id, session_id, url, recording_data, "
                    "started_at) VALUES ($1, $2, '/signup', '{}', $3)",
                    domain_id, session, when,
                )
            await _visit(conn, domain_id, when, ["/", "/signup"],
                         events=[("signup", "/signup", {})])

    assert analyst_service.parse_metric(
        "Why did sign-ups drop?", await analyst_service.site_events(str(domain_id), end)
    ) == ("event", "signup")

    result = await analyst_service.analyse(shop, "event", "signup", mid, end, "Why?")
    assert result["status"] == "ok"
    assert result["headline"] == {"now": 12, "before": 24, "delta": -12, "changePct": -50}
    top = result["segments"][0]
    assert (top["dimension"], top["key"], top["now"], top["before"]) == ("device", "mobile", 0, 12)
    assert top["shareOfChangePct"] == 100
    assert result["evidence"][0]["kind"] == "error"
    assert "TypeError: form is null" in result["evidence"][0]["subject"]
    assert len(result["recordings"]) == 2
    assert result["aiGenerated"] is False and result["fixes"]

    bounce = await analyst_service.analyse(shop, "bounce_rate", None, mid, end)
    assert bounce["status"] == "ok" and bounce["headline"]["delta"] == 0
    visitors = await analyst_service.analyse(shop, "visitors", None, mid, end)
    assert visitors["headline"]["now"] == 24
