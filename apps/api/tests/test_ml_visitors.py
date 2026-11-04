"""Visitor scores: the conversion model, churn risk, and how the service uses them."""

from __future__ import annotations

import random
import uuid
from datetime import UTC, datetime

from app.ml import churn, convert
from app.services import visitor_score_service as scores

# --- conversion -----------------------------------------------------------------


def _visitor(rng: random.Random, engaged: bool) -> dict:
    """A made-up visitor; engaged ones view more, stay longer and convert more."""
    pages = rng.randint(4, 12) if engaged else rng.randint(1, 3)
    converted = rng.random() < (0.35 if engaged else 0.03)
    return {
        "pageviews": pages,
        "active_seconds": pages * rng.uniform(20, 60),
        "interactions": pages * rng.randint(0, 3),
        "sessions": rng.randint(1, 3),
        "days_known": rng.uniform(0, 5),
        "source_type": rng.choice(["search", "direct", "social"]),
        "screen_width": rng.choice([390, 1440]),
        "converted": converted,
    }


def _visitors(n: int, seed: int = 1) -> list[dict]:
    rng = random.Random(seed)
    return [_visitor(rng, rng.random() < 0.4) for _ in range(n)]


def test_features_follow_the_feature_list():
    row = {
        "pageviews": 3, "active_seconds": 120, "interactions": 0, "sessions": 2,
        "days_known": 0, "source_type": "campaign", "screen_width": 390,
    }
    x = dict(zip(convert.FEATURES, convert.features(row), strict=True))
    assert x["returning"] == 1.0 and x["mobile"] == 1.0 and x["from_ads"] == 1.0
    assert x["from_search"] == 0.0 and x["interactions"] == 0.0
    assert convert.features({}) == [0.0] * len(convert.FEATURES)


def test_auc():
    assert convert.auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1]) == 1.0
    assert convert.auc([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1]) == 0.0
    assert convert.auc([0.5, 0.5], [0, 1]) == 0.5  # ties count half
    assert convert.auc([0.1, 0.2], [1, 1]) is None


def test_train_learns_who_converts():
    model = convert.train(_visitors(1200))
    assert model is not None and model.useful
    assert model.trained_on == 1200
    assert "pageviews" in model.drivers() or "active_minutes" in model.drivers()
    keen = {"pageviews": 10, "active_seconds": 400, "interactions": 20, "sessions": 2}
    browsing = {"pageviews": 1, "active_seconds": 5, "interactions": 0, "sessions": 1}
    keen_p = model.probability(convert.features(keen))
    assert keen_p > 3 * model.probability(convert.features(browsing))


def test_train_needs_enough_visitors_and_converters():
    assert convert.train(_visitors(100)) is None
    no_one = [{**row, "converted": False} for row in _visitors(500)]
    assert convert.train(no_one) is None


def test_noise_is_not_learnable():
    rng = random.Random(3)
    rows = [
        {**_visitor(rng, rng.random() < 0.4), "converted": rng.random() < 0.1} for _ in range(800)
    ]
    model = convert.train(rows)
    assert model is not None and not model.useful


def test_model_round_trips_and_rejects_old_features():
    model = convert.train(_visitors(600))
    again = convert.Model.from_json(model.to_json())
    x = convert.features(_visitors(1, seed=9)[0])
    assert abs(again.probability(x) - model.probability(x)) < 1e-12
    assert convert.Model.from_json({**model.to_json(), "names": ["pageviews"]}) is None


def test_bands_are_relative_to_the_site():
    assert convert.band(0.07, 0.02) == "high"
    assert convert.band(0.04, 0.02) == "medium"
    assert convert.band(0.02, 0.02) == "low"
    assert convert.band(0.6, 0.5) == "high"  # capped, so a busy site still has bands


# --- churn ----------------------------------------------------------------------


def test_one_time_visitors_have_no_churn_risk():
    assert churn.assess([100], 130, 7.0) is None
    assert churn.assess([], 130, 7.0) is None


def test_risk_grows_with_time_away():
    daily = list(range(100, 120))  # every day for 20 days
    risks = [churn.assess(daily, 119 + away, 7.0).risk for away in (0, 3, 10, 30)]
    assert risks == sorted(risks) and risks[0] < 0.1 and risks[-1] > churn.HIGH
    assert churn.assess(daily, 149, 7.0).band == "high"


def test_a_monthly_visitor_away_a_week_is_fine():
    monthly = [0, 30, 60, 90, 120]
    risk = churn.assess(monthly, 127, 7.0)
    assert risk.band == "low" and risk.typical_gap_days > 20


def test_few_visits_lean_on_the_site_gap():
    two = churn.assess([100, 101], 101, 14.0)
    assert two.typical_gap_days > 5  # one quick return doesn't make them a daily visitor


def test_site_gap():
    assert churn.site_gap([]) == churn.DEFAULT_SITE_GAP
    assert churn.site_gap([1, 3, 10]) == 3
    assert churn.typical_gap([5, 5, 5]) is None
    assert churn.typical_gap([0, 10, 20]) == 10


# --- service --------------------------------------------------------------------


def test_pick_event_takes_the_first_conversion_name():
    events = [{"name": "video_play"}, {"name": "Sign Up"}, {"name": "purchase"}]
    assert scores.pick_event(events) == "Sign Up"
    assert scores.pick_event([{"name": "video_play"}]) is None


def test_in_segment():
    likely = {"conversion": {"converted": False, "probability": 0.3, "band": "high"}, "churn": None}
    low = {"conversion": {"converted": False, "probability": 0.01, "band": "low"}, "churn": None}
    done = {"conversion": {"converted": True, "probability": None, "band": None}, "churn": None}
    lost = {"conversion": None, "churn": {"risk": 0.8, "band": "high"}}
    assert scores.in_segment(likely, "likely") == 0.3
    assert scores.in_segment(low, "likely") is None
    assert scores.in_segment(done, "likely") is None
    assert scores.in_segment(lost, "at_risk") == 0.8
    assert scores.in_segment(likely, "at_risk") is None
    assert scores.in_segment(None, "likely") is None


async def test_score_without_a_model_gives_churn_only(monkeypatch):
    today = (datetime.now(UTC).date() - scores.EPOCH_DAY).days
    vid = uuid.uuid4()
    calls = []

    async def _query(sql, *args):
        calls.append(args)
        return [{"id": str(vid), "days": list(range(today - 40, today - 20))}]

    monkeypatch.setattr(scores, "query", _query)
    loaded = {
        "event": None, "model": None, "reason": "no_event", "fittedAt": None, "siteGapDays": 7.0
    }
    result = await scores.score("d1", [vid], loaded)
    assert len(calls[0]) == 2  # no conversion event passed
    assert result[str(vid)]["conversion"] is None
    assert result[str(vid)]["churn"]["band"] == "high"
    assert await scores.score("d1", [], loaded) == {}


async def test_score_with_a_model(monkeypatch):
    model = convert.train(_visitors(1200))
    keen = {"pageviews": 10, "active_seconds": 400, "interactions": 20, "sessions": 1,
            "days_known": 0, "source_type": None, "screen_width": 1440}

    async def _query(sql, *args):
        assert args[1] == "signup"
        return [
            {"id": "a", "days": [1], "converted": False, **keen},
            {"id": "b", "days": [1], "converted": True, **keen},
        ]

    monkeypatch.setattr(scores, "query", _query)
    loaded = {
        "event": "signup", "model": model, "reason": None, "fittedAt": None, "siteGapDays": 7.0
    }
    result = await scores.score("d1", ["a", "b"], loaded)
    assert result["a"]["conversion"]["band"] in ("high", "medium")
    assert result["b"]["conversion"] == {"converted": True, "probability": None, "band": None}
    assert result["a"]["churn"] is None
    assert scores.model_info(loaded)["available"] is True


async def test_fit_domain_stores_why_there_is_no_model(monkeypatch):
    stored = {}

    async def _query(sql, *args):
        if "INSERT INTO site_models" in sql:
            stored[args[1]] = (args[2], args[3])
            return [{"1": 1}]
        if sql is scores._SITE_GAPS_SQL:
            return [{"days": [1, 3, 5]}, {"days": [1, 15]}]
        if sql is scores._TRAIN_SQL:
            return _visitors(50)
        if "type = 'custom'" in sql:
            return [{"name": "signup", "visitors": 4}]
        return []

    monkeypatch.setattr(scores, "query", _query)
    result = await scores.fit_domain({"id": uuid.uuid4(), "domain": "example.com"})
    assert result == {"event": "signup", "trained": False, "auc": None}
    assert stored["conversion"] == ("signup", {"visitors": 50, "reason": "too_little_data"})
    assert stored["churn"][1]["siteGapDays"] == 8.0  # median of 2 and 14


async def test_load_without_a_fit(monkeypatch):
    async def _query(sql, *args):
        return []

    monkeypatch.setattr(scores, "query", _query)
    loaded = await scores.load("d1")
    assert loaded["reason"] == "not_fitted" and loaded["model"] is None
    assert loaded["siteGapDays"] == churn.DEFAULT_SITE_GAP
    info = scores.model_info(loaded)
    assert info["available"] is False and info["drivers"] == []
