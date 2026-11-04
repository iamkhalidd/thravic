"""Anomaly detection on made-up sites, and how its findings reach insights and alerts.

No database: queries are replaced where a function makes them.
"""

from __future__ import annotations

import random
from datetime import UTC, date, datetime, timedelta

from app.ml import anomaly
from app.services import anomaly_service, insight_facts, insight_service
from app.services.alert_service import judge_traffic, judge_unusual_segment

# Monday-to-Sunday shape of a typical business site
WEEK = [1.2, 1.25, 1.2, 1.15, 1.0, 0.6, 0.6]


def _site(days: int, base: float = 200, noise: float = 0.08, seed: int = 1) -> list[float]:
    rng = random.Random(seed)
    return [max(0.0, round(base * WEEK[t % 7] * (1 + rng.gauss(0, noise)))) for t in range(days)]


# ── One unusual day ────────────────────────────────────────────────────────


def test_normal_days_are_rarely_flagged():
    flagged = sum(anomaly.check_day(_site(57, seed=s)) is not None for s in range(60))
    assert flagged <= 2


def test_a_quiet_weekend_is_not_a_drop():
    # Day 55 is a Sunday: 0.6 of a weekday is normal for it
    values = _site(56, noise=0.0)
    assert values[-1] == 120
    assert anomaly.check_day(values) is None


def test_a_spike_and_a_drop_are_flagged_with_the_usual_range():
    values = _site(57)
    normal = values[-1]

    spike = anomaly.check_day([*values[:-1], normal * 2.5])
    assert spike is not None and spike.direction == "up" and spike.kind == "day"
    assert spike.low < spike.expected < spike.high < spike.actual
    assert spike.score >= anomaly.FLAG_SCORE
    assert spike.change_pct > 100

    drop = anomaly.check_day([*values[:-1], normal * 0.3])
    assert drop is not None and drop.direction == "down"
    assert drop.actual < drop.low and drop.change_pct < -50


def test_small_moves_on_a_small_site_are_never_news():
    values = _site(57, base=4, noise=0.2)
    assert anomaly.check_day([*values[:-1], values[-1] + 8]) is None


def test_one_past_spike_does_not_hide_the_next():
    values = _site(57)
    values[30] *= 6  # a post went viral once
    values[-1] *= 2.2
    found = anomaly.check_day(values)
    assert found is not None and found.direction == "up"


def test_too_little_history_gives_nothing():
    assert anomaly.check_day(_site(15)) is None
    assert anomaly.check_slide(_site(50)) is None


# ── A slow slide ───────────────────────────────────────────────────────────


def _sliding(rate: float, seed: int = 1) -> list[float]:
    """4 normal weeks, then 4 weeks each `rate` lower than the one before."""
    values = _site(anomaly.SLIDE_DAYS, seed=seed)
    for t in range(28, len(values)):
        values[t] = round(values[t] * (1 - rate) ** ((t - 28) // 7 + 1))
    return values


def test_a_steady_slide_is_found_though_no_day_stands_out():
    values = _sliding(0.08)
    assert anomaly.check_day(values) is None
    found = anomaly.check_slide(values)
    assert found is not None and found.kind == "slide" and found.direction == "down"
    assert found.change_pct <= -anomaly.SLIDE_MIN_PCT
    assert found.actual == sum(values[-7:])


def test_flat_weeks_and_one_odd_week_are_not_slides():
    assert all(anomaly.check_slide(_site(anomaly.SLIDE_DAYS, seed=s)) is None for s in range(20))
    values = _site(anomaly.SLIDE_DAYS)
    for t in range(49, 56):
        values[t] *= 0.5  # only the last week was low
    assert anomaly.check_slide(values) is None


def test_growth_is_a_slide_up():
    found = anomaly.check_slide(_sliding(-0.1))
    assert found is not None and found.direction == "up"


# ── The scan ───────────────────────────────────────────────────────────────


def _rows(metric: str, dimension: str, key: str, values: list[float], first: date) -> list[dict]:
    return [
        {
            "metric": metric,
            "dimension": dimension,
            "key": key,
            "day": first + timedelta(days=i),
            "n": v,
        }
        for i, v in enumerate(values)
    ]


def test_scan_finds_the_source_that_dropped_and_skips_tiny_series():
    day = date(2026, 11, 3)
    first, _, _ = anomaly_service.scan_window(day)
    total = _site(anomaly_service.SCAN_DAYS, base=400)
    social = _site(anomaly_service.SCAN_DAYS, base=150, seed=2)
    social[-1] = 5
    tiny = [1.0] * (anomaly_service.SCAN_DAYS - 1) + [9.0]
    rows = (
        _rows("sessions", "site", "all", total, first)
        + _rows("sessions", "channel", "social", social, first)
        + _rows("event", "event", "signup", tiny, first)
    )
    found = anomaly_service.find(rows, first, day)
    assert [(f["dimension"], f["key"]) for f in found] == [("channel", "social")]
    assert found[0]["link"] == "/dashboard/traffic/sources"
    assert found[0]["finding"].direction == "down"


def test_scan_window_ends_with_the_day_checked():
    first, start, end = anomaly_service.scan_window(date(2026, 11, 3))
    assert (date(2026, 11, 3) - first).days == anomaly_service.SCAN_DAYS - 1
    assert end == datetime(2026, 11, 4, tzinfo=UTC) and start.date() == first


# ── Insights ───────────────────────────────────────────────────────────────

ROW = {
    "day": date(2026, 11, 2),
    "metric": "sessions",
    "dimension": "channel",
    "key": "social",
    "kind": "day",
    "direction": "down",
    "actual": 12.0,
    "expected": 181.4,
    "low": 150.2,
    "high": 212.6,
    "change_pct": -93,
    "link": "/dashboard/traffic/sources",
}


async def _anomaly_facts(monkeypatch, rows: list[dict]) -> list[dict]:
    async def fake_query(*_):
        return rows

    monkeypatch.setattr(insight_facts, "query", fake_query)
    sheet = insight_facts.FactSheet()
    w = insight_facts.Windows.ending(datetime(2026, 11, 4, tzinfo=UTC))
    await insight_facts._anomalies(sheet, {"id": "d1"}, w)
    return sheet.facts


async def test_anomalies_become_facts_with_the_usual_range(monkeypatch):
    slide = {**ROW, "kind": "slide", "metric": "event", "dimension": "event", "key": "signup"}
    facts = await _anomaly_facts(monkeypatch, [ROW, slide])
    assert facts[0]["kind"] == "anomaly"
    assert facts[0]["subject"] == "Unusual day: Sessions from channel “social” on Nov 2"
    assert facts[0]["numbers"] == {
        "actual": 12,
        "expected": 181,
        "usualLow": 150,
        "usualHigh": 213,
        "changePct": -93,
    }
    assert facts[1]["subject"].startswith("Unusual trend: Custom event “signup”, falling")


async def test_rule_insight_for_an_anomaly_passes_the_number_check(monkeypatch):
    facts = await _anomaly_facts(monkeypatch, [ROW])
    insights = insight_service.rule_insights(facts)
    assert insights[0]["type"] == "traffic" and insights[0]["priority"] == "high"
    assert "93%" in insights[0]["title"]
    assert insight_service.validate(insights, facts) == insights


async def test_validator_accepts_anomaly_numbers_and_rejects_invented_ones(monkeypatch):
    facts = await _anomaly_facts(monkeypatch, [ROW])
    item = {
        "type": "traffic",
        "priority": "high",
        "title": "Social traffic fell 93%",
        "description": "12 sessions from social on Nov 2, when 150 to 213 is normal.",
        "recommendation": "Check your social links still work.",
        "facts": ["F1"],
    }
    assert len(insight_service.validate([item], facts)) == 1
    invented = {**item, "description": "12 sessions, when 400 is normal."}
    assert insight_service.validate([invented], facts) == []


def test_the_prompt_leads_with_anomalies():
    assert '"anomaly" facts' in insight_service.SYSTEM_PROMPT


# ── Alerts ─────────────────────────────────────────────────────────────────

TUESDAY = datetime(2026, 10, 27, 12, tzinfo=UTC)


def test_a_site_whose_hours_swing_widely_needs_a_bigger_drop():
    # Half of the median, but these hours are often that low here
    assert judge_traffic("a.com", 10, [40, 12, 70, 18], TUESDAY) is None
    assert judge_traffic("a.com", 15, [40, 35, 42, 37], TUESDAY).kind == "traffic_drop"


def test_an_unusual_source_raises_an_alert_with_its_range():
    alert = judge_unusual_segment("a.com", ROW)
    assert alert.kind == "unusual_segment"
    assert alert.title == "Unusual drop: sessions from channel “social”"
    assert "12 on Monday" in alert.message and "about 181" in alert.message
    assert "150 to 213" in alert.message and "-93%" in alert.message
    assert alert.link == "/dashboard/traffic/sources"
    assert judge_unusual_segment("a.com", None) is None
