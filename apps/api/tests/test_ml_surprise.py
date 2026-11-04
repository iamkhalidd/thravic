"""The analyst ranks the parts of a change by how unlike the rest of the site they moved."""

from __future__ import annotations

from datetime import UTC, datetime

from app.services import analyst_service, insight_facts


def _row(dimension, key, now, before, now_bounced=0, before_bounced=0):
    return {
        "dimension": dimension,
        "key": key,
        "now": now,
        "before": before,
        "now_bounced": now_bounced,
        "before_bounced": before_bounced,
    }


# The whole site halved; mobile and desktop halved with it, /checkout fell 90%
HALVED = [
    _row("total", "all", 300, 600),
    _row("device", "mobile", 200, 400),
    _row("device", "desktop", 100, 200),
    _row("page", "/checkout", 10, 100),
]


def test_a_part_that_fell_more_than_the_site_comes_before_bigger_parts():
    _, segments = insight_facts.rank_segments(HALVED)
    assert [s["key"] for s in segments] == ["/checkout", "mobile", "desktop"]
    checkout = segments[0]
    assert checkout["unusual"] and checkout["expected"] == 50.0
    assert checkout["surprise"] <= -insight_facts.SURPRISE_SCORE
    # Mobile lost more visits in total, but only moved with the site
    assert segments[1]["surprise"] == 0.0 and not segments[1]["unusual"]


def test_with_no_part_unusual_the_order_is_by_share():
    rows = [
        _row("total", "all", 300, 600),
        _row("device", "desktop", 100, 200),
        _row("device", "mobile", 200, 400),
    ]
    _, segments = insight_facts.rank_segments(rows)
    assert [s["key"] for s in segments] == ["mobile", "desktop"]
    assert not any(s["unusual"] for s in segments)


def test_a_new_segment_has_nothing_to_compare_with():
    rows = [_row("total", "all", 150, 100), _row("channel", "social", 50, 0)]
    _, segments = insight_facts.rank_segments(rows)
    assert segments[0]["expected"] is None and not segments[0]["unusual"]


def test_a_bounce_rate_jump_on_one_device_is_unusual():
    rows = [
        _row("total", "all", 400, 400, 200, 160),  # 50% now, 40% before
        _row("device", "desktop", 300, 300, 120, 120),  # 40%, unchanged
        _row("device", "mobile", 100, 100, 80, 40),  # 40% to 80%
    ]
    _, segments = insight_facts.rank_segments(rows, is_rate=True)
    mobile = segments[0]
    assert mobile["key"] == "mobile" and mobile["unusual"]
    assert mobile["expected"] == 50.0  # its 40% plus the site's 10 points


def _explanation(rows) -> insight_facts.Explanation:
    headline, segments = insight_facts.rank_segments(rows)
    for seg in segments:
        seg["fact"] = "F2"
    w = insight_facts.Windows.ending(datetime(2026, 11, 4, tzinfo=UTC))
    return insight_facts.Explanation(
        "sessions", None, headline, segments, [], [], insight_facts.FactSheet(), w
    )


def test_rule_answer_names_the_unusual_part_and_what_was_expected():
    answer = analyst_service.rule_answer(_explanation(HALVED))
    assert answer["cause"].startswith("Landing page “/checkout” moved unlike the rest of the site")
    assert "100 before, 10 now" in answer["cause"] and "about 50" in answer["cause"]


def test_the_prompt_explains_unusual_segments():
    assert "moved unlike the rest of the site" in analyst_service.SYSTEM_PROMPT
    assert "countIfLikeSite" in analyst_service.SYSTEM_PROMPT
