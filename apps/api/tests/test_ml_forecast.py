"""The forecast model on made-up sites whose weekly pattern and trend are known.

No database: the model only sees a list of daily counts.
"""

from __future__ import annotations

import json
import random
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

from app.ml import forecast, seasonal, series
from app.routers import insights
from app.routers.insights import _simple_forecast

# Monday-to-Sunday shape of a typical business site
WEEK = [1.2, 1.25, 1.2, 1.15, 1.0, 0.6, 0.6]


def _site(days: int, base: float = 200, growth: float = 0.0, noise: float = 0.0, seed: int = 1):
    """`days` of counts with the weekly shape, a daily growth and random noise."""
    rng = random.Random(seed)
    out = []
    for t in range(days):
        expected = (base + growth * t) * WEEK[t % 7]
        out.append(max(0.0, round(expected + rng.gauss(0, noise * expected))))
    return out


def _truth(t: int, base: float = 200, growth: float = 0.0) -> float:
    return (base + growth * t) * WEEK[t % 7]


# ── Series ─────────────────────────────────────────────────────────────────


def test_daily_values_fill_missing_days_with_zero():
    rows = [
        {"bucket": "2026-10-01T00:00:00Z", "pageviews": 5},
        {"bucket": "2026-10-03T00:00:00Z", "pageviews": 7},
    ]
    assert series.daily_values(rows, "pageviews", date(2026, 10, 1), date(2026, 10, 4)) == [
        5.0,
        0.0,
        7.0,
        0.0,
    ]


def test_trim_leading_zeros_keeps_zeros_after_the_first_day_with_data():
    assert series.trim_leading_zeros([0, 0, 3, 0, 4]) == [3, 0, 4]
    assert series.trim_leading_zeros([0, 0]) == []


# ── Weekly profile ─────────────────────────────────────────────────────────


def test_weekly_profile_finds_the_weekday_pattern():
    profile = seasonal.weekly_profile(_site(14))
    assert abs(profile.level - 200) < 2
    assert abs(profile.trend) < 0.5
    for offset, shape in zip(profile.offsets, WEEK, strict=True):
        assert abs(offset - 200 * (shape - 1)) < 3


def test_weekly_profile_separates_trend_from_weekends():
    profile = seasonal.weekly_profile(_site(14, growth=5))
    assert 3 < profile.trend < 7
    # Weekends stay the quiet days even though the second week is busier
    assert profile.offsets[5] < -50 and profile.offsets[6] < -50


# ── Forecast ───────────────────────────────────────────────────────────────


def test_too_little_data_or_none_at_all_gives_no_forecast():
    assert forecast.forecast(_site(forecast.MIN_DAYS - 1), 7) is None
    assert forecast.forecast([0.0] * 40, 7) is None


def test_clean_weekly_site_is_predicted_almost_exactly():
    history = _site(56)
    result = forecast.forecast(history, 7)
    assert result is not None
    for h, point in enumerate(result.points, start=1):
        assert abs(point.predicted - _truth(55 + h)) < 0.05 * _truth(55 + h)
        assert point.low <= point.predicted <= point.high


def test_growing_site_keeps_growing_and_keeps_its_weekends():
    history = _site(56, growth=2, noise=0.05)
    result = forecast.forecast(history, 7)
    assert result is not None
    assert result.trend > 0
    predicted = [p.predicted for p in result.points]
    # Day 56 is a Monday (56 % 7 == 0), so days 6 and 7 ahead are the weekend
    assert max(predicted[5:]) < min(predicted[:4])
    for h, point in enumerate(result.points, start=1):
        assert abs(point.predicted - _truth(55 + h, growth=2)) < 0.15 * _truth(55 + h, growth=2)


def test_range_holds_about_the_promised_share_of_days():
    """80% ranges, checked on many made-up sites and starting points."""
    inside = total = 0
    for seed in range(40):
        history = _site(70, base=300, growth=0.5, noise=0.12, seed=seed)
        result = forecast.forecast(history[:56], 7)
        assert result is not None
        for point, actual in zip(result.points, history[56:63], strict=True):
            inside += point.low <= actual <= point.high
            total += 1
    assert 0.65 <= inside / total <= 0.95


def test_range_widens_further_ahead():
    result = forecast.forecast(_site(56, noise=0.1), 14)
    assert result is not None
    widths = [p.high - p.low for p in result.points]
    assert widths[-1] > widths[0]


def test_never_below_zero():
    # A small site falling fast: the trend alone would go negative
    history = [max(0.0, 30 - t) * WEEK[t % 7] for t in range(28)]
    result = forecast.forecast(history, 14)
    assert result is not None
    assert all(p.low >= 0 and p.predicted >= 0 for p in result.points)


def test_beats_the_moving_average_it_replaces():
    """Average miss over the next week, on weekly sites, against the old method."""
    model_miss = simple_miss = 0.0
    now = datetime(2026, 11, 4, tzinfo=UTC)
    for seed in range(20):
        history = _site(63, base=250, growth=1, noise=0.1, seed=seed)
        past, ahead = history[:56], history[56:63]

        result = forecast.forecast(past, 7)
        assert result is not None
        model_miss += sum(abs(p.predicted - a) for p, a in zip(result.points, ahead, strict=True))

        running = 0.0
        historical = []
        for value in past[-14:]:
            running = running * 0.7 + value * 0.3
            historical.append({"pageviewsMA": round(running)})
        simple = _simple_forecast(historical, now)["forecast"]
        simple_miss += sum(abs(p["predicted"] - a) for p, a in zip(simple, ahead, strict=True))

    assert model_miss < 0.5 * simple_miss


# ── The trends endpoint ────────────────────────────────────────────────────


async def _trends(monkeypatch, daily: list[float]) -> dict:
    """GET /trends for a site whose last `len(daily)` days (ending today) had `daily` pageviews."""
    today = datetime.now(UTC).date()
    rows = [
        {
            "bucket": f"{today - timedelta(days=len(daily) - 1 - i)}T00:00:00Z",
            "pageviews": v,
            "visitors": v // 2,
        }
        for i, v in enumerate(daily)
    ]

    async def domain(*_):
        return {"id": "d1"}

    async def timeseries(*_):
        return rows

    monkeypatch.setattr(insights, "_require_domain", domain)
    monkeypatch.setattr(insights.event_service, "get_timeseries", timeseries)
    response = await insights.trends("d1", user=SimpleNamespace(user_id="u1"), _feature=None)
    return json.loads(response.body)


async def test_trends_uses_the_model_with_three_weeks_of_data(monkeypatch):
    # 8 whole weeks, then today's half day, which the model must not learn from
    body = await _trends(monkeypatch, [*(int(v) for v in _site(56)), 40])
    assert body["method"] == "seasonal"
    assert body["rangePct"] == 80
    assert len(body["historical"]) == 14 and body["historical"][-1]["pageviews"] == 40
    days = [p["date"] for p in body["forecast"]]
    tomorrow = datetime.now(UTC).date() + timedelta(days=1)
    assert days == [str(tomorrow + timedelta(days=i)) for i in range(7)]
    for point in body["forecast"]:
        assert point["low"] <= point["predicted"] <= point["high"]
        # A weekday of the made-up site is never below 100, despite today's 40
        assert point["predicted"] > 100
    assert body["trend"]["direction"] == "stable"


async def test_trends_falls_back_for_a_new_site(monkeypatch):
    body = await _trends(monkeypatch, [0] * 40 + [int(v) for v in _site(10)])
    assert body["method"] == "simple"
    assert len(body["forecast"]) == 7
    assert all("low" not in p for p in body["forecast"])
