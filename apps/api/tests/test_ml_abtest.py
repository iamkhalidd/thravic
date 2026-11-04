"""A/B test results on made-up counts, and how a winner reaches insights and alerts.

No database: queries are replaced where a function makes them.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.ml import abtest
from app.routers import experiments as experiments_router
from app.services import experiment_service, insight_facts, insight_service
from app.services.alert_service import judge_experiment_winner


def _versions(*counts: tuple[int, int], weights: list[float] | None = None) -> list[dict]:
    weights = weights or [100 / len(counts)] * len(counts)
    return [
        {
            "id": chr(97 + i),
            "name": "Original" if i == 0 else f"Version {chr(65 + i)}",
            "weight": weights[i],
            "visitors": visitors,
            "conversions": conversions,
        }
        for i, (visitors, conversions) in enumerate(counts)
    ]


# ── The maths ──────────────────────────────────────────────────────────────


def test_a_clear_winner_is_called():
    result = abtest.analyse(_versions((2000, 100), (2000, 160)))
    assert result["status"] == abtest.WINNER
    assert result["winner"] == "b"
    b = result["variants"][1]
    assert b["chanceBest"] > 0.99
    assert b["lift"] == 0.6
    assert b["liftLow"] < 0.6 < b["liftHigh"]
    assert b["liftLow"] > 0
    assert result["variants"][0]["lift"] is None
    assert result["visitorsNeeded"] is None
    assert result["splitOk"]


def test_the_original_can_win():
    result = abtest.analyse(_versions((2000, 160), (2000, 100)))
    assert result["status"] == abtest.WINNER and result["winner"] == "a"


def test_few_visitors_is_too_early_with_visitors_needed():
    result = abtest.analyse(_versions((60, 3), (60, 9)))
    assert result["status"] == abtest.TOO_EARLY
    assert result["winner"] is None
    assert result["visitorsNeeded"] > 0


def test_a_big_test_with_the_same_rates_is_no_difference():
    result = abtest.analyse(_versions((40000, 4000), (40000, 4010)))
    assert result["status"] == abtest.NO_DIFFERENCE
    assert 0.3 < result["variants"][1]["chanceBest"] < 0.7


def test_no_visitors_is_no_data():
    result = abtest.analyse(_versions((0, 0), (0, 0)))
    assert result["status"] == abtest.NO_DATA
    assert result["variants"][0]["chanceBest"] is None
    assert result["visitorsNeeded"] is None


def test_the_same_counts_always_give_the_same_answer():
    versions = _versions((500, 40), (500, 52))
    assert abtest.analyse(versions) == abtest.analyse(versions)


def test_a_broken_split_stops_a_winner():
    # Asked for 50/50 but one version got far fewer visitors
    result = abtest.analyse(_versions((3000, 150), (1000, 90)))
    assert not result["splitOk"]
    assert result["splitP"] < abtest.SPLIT_P
    assert result["status"] != abtest.WINNER


def test_an_uneven_split_that_was_asked_for_is_fine():
    result = abtest.analyse(_versions((3000, 150), (1000, 90), weights=[75, 25]))
    assert result["splitOk"]


def test_visitors_in_a_version_meant_to_get_none_break_the_split():
    assert (
        abtest.split_check(
            [
                abtest.Arm("a", "A", 100, 500, 10),
                abtest.Arm("b", "B", 0, 20, 1),
            ]
        )
        == 0.0
    )


def test_chi_square_tail_matches_known_values():
    # 3.84 is the 5% point for 1 degree of freedom, 5.99 for 2
    assert abs(abtest.chi_square_p(3.841, 1) - 0.05) < 0.005
    assert abs(abtest.chi_square_p(5.991, 2) - 0.05) < 0.005
    assert abtest.chi_square_p(0, 1) == 1.0


def test_visitors_needed_follows_lehrs_rule():
    arms = [abtest.Arm("a", "A", 50, 100, 10), abtest.Arm("b", "B", 50, 100, 10)]
    # p = 0.1, smallest change 10% of 0.1: 16 * 0.09 / 0.0001 = 14400 a version
    assert abtest.visitors_needed(arms) == 14400 * 2 - 200


# ── Counting from events ───────────────────────────────────────────────────

EXPERIMENT = {
    "id": "e1",
    "domain_id": "d1",
    "name": "New headline",
    "key": "new-headline",
    "status": "active",
    "variants": [
        {"id": "a", "name": "Original", "weight": 50},
        {"id": "b", "name": "Bold", "weight": 50},
    ],
    "traffic_allocation": 100,
    "goal_event": "signup",
    "started_at": datetime(2026, 10, 1, tzinfo=UTC),
    "ended_at": None,
    "created_at": datetime(2026, 9, 30, tzinfo=UTC),
    "decided_at": None,
}
NOW = datetime(2026, 11, 4, tzinfo=UTC)


def test_make_key():
    assert experiment_service.make_key("New pricing headline!") == "new-pricing-headline"
    assert experiment_service.make_key("???") == "experiment"
    assert len(experiment_service.make_key("x" * 200)) == experiment_service.KEY_MAX


async def test_results_count_each_version_from_the_query(monkeypatch):
    calls = []

    async def fake_query(sql, *args):
        calls.append(args)
        return [
            {"variant": "a", "visitors": 2000, "conversions": 100},
            {"variant": "b", "visitors": 2000, "conversions": 160},
        ]

    monkeypatch.setattr(experiment_service, "query", fake_query)
    result = await experiment_service.results(EXPERIMENT, NOW)
    assert calls[0] == ("d1", "e1", EXPERIMENT["started_at"], NOW, "signup")
    assert result["status"] == abtest.WINNER and result["winner"] == "b"
    assert result["goalEvent"] == "signup"
    assert result["computedAt"] == NOW.isoformat()


async def test_a_version_nobody_saw_counts_as_zero(monkeypatch):
    async def fake_query(sql, *args):
        return [{"variant": "a", "visitors": 5, "conversions": 1}]

    monkeypatch.setattr(experiment_service, "query", fake_query)
    result = await experiment_service.results(EXPERIMENT, NOW)
    assert result["variants"][1]["visitors"] == 0
    assert result["status"] == abtest.TOO_EARLY


async def test_check_domain_stores_results_and_counts_new_winners(monkeypatch):
    updates = []

    async def fake_query(sql, *args):
        if sql.lstrip().startswith("SELECT * FROM experiments"):
            return [EXPERIMENT, {**EXPERIMENT, "id": "e2", "decided_at": NOW}]
        if "UPDATE experiments" in sql:
            updates.append(args)
            return [{"?column?": 1}]
        return [
            {"variant": "a", "visitors": 2000, "conversions": 100},
            {"variant": "b", "visitors": 2000, "conversions": 160},
        ]

    monkeypatch.setattr(experiment_service, "query", fake_query)
    outcome = await experiment_service.check_domain("d1", NOW)
    assert outcome == {"checked": 2, "decided": 1}
    assert [u[0] for u in updates] == ["e1", "e2"]
    assert updates[0][1]["status"] == abtest.WINNER and updates[0][2] is True


async def test_the_tracker_gets_running_tests_only_on_plans_that_have_them(monkeypatch):
    class Plan:
        def __init__(self, features):
            self.features = features

    plan = Plan(["experiments"])

    async def owner_plan(_):
        return plan

    async def fake_query(sql, *args):
        return [
            {
                "id": "e1",
                "key": "new-headline",
                "traffic_allocation": 50,
                "variants": EXPERIMENT["variants"],
            }
        ]

    monkeypatch.setattr(experiment_service.plan_service, "owner_plan", owner_plan)
    monkeypatch.setattr(experiment_service, "query", fake_query)
    site = {"id": "d1", "platform": "web"}
    assert await experiment_service.tracker_experiments(site) == [
        {
            "id": "e1",
            "key": "new-headline",
            "traffic": 50,
            "variants": [{"id": "a", "weight": 50}, {"id": "b", "weight": 50}],
        }
    ]
    # Apps get the same list, for the SDK's Thravic.variant()
    app = {"id": "d1", "platform": "ios"}
    assert await experiment_service.tracker_experiments(app) == (
        await experiment_service.tracker_experiments(site)
    )
    plan.features = []
    assert await experiment_service.tracker_experiments(site) == []


# ── Saving a test ──────────────────────────────────────────────────────────


def test_validate_takes_a_key_and_a_goal():
    values, issues = experiments_router._validate(
        {
            "name": "T",
            "variants": EXPERIMENT["variants"],
            "key": "my-test",
            "goalEvent": "  signup ",
        }
    )
    assert issues == []
    assert values["key"] == "my-test" and values["goalEvent"] == "signup"

    values, _ = experiments_router._validate(
        {"name": "T", "variants": EXPERIMENT["variants"], "goalEvent": " "}
    )
    assert values["goalEvent"] is None and values["key"] is None

    _, issues = experiments_router._validate(
        {"name": "T", "variants": EXPERIMENT["variants"], "key": "Not A Key"}
    )
    assert issues and issues[0]["path"] == ["key"]


async def test_a_taken_key_gets_a_number(monkeypatch):
    async def fake_query(sql, *args):
        return [{"key": "promo"}, {"key": "promo-2"}]

    monkeypatch.setattr(experiments_router, "query", fake_query)
    assert await experiments_router._free_key("d1", "promo") == "promo-3"
    assert await experiments_router._free_key("d1", "other") == "other"


# ── Insights and alerts ────────────────────────────────────────────────────


def _decided() -> dict:
    result = abtest.analyse(_versions((2000, 100), (2000, 160)))
    result["variants"][1]["name"] = "Bold"
    return {"name": "New headline", "result": result}


async def _experiment_facts(monkeypatch, rows: list[dict]) -> list[dict]:
    async def fake_query(*_):
        return rows

    monkeypatch.setattr(insight_facts, "query", fake_query)
    sheet = insight_facts.FactSheet()
    w = insight_facts.Windows.ending(NOW)
    await insight_facts._experiments(sheet, {"id": "d1"}, w)
    return sheet.facts


async def test_a_winner_becomes_a_fact(monkeypatch):
    facts = await _experiment_facts(monkeypatch, [_decided()])
    assert facts[0]["kind"] == "experiment"
    assert facts[0]["subject"] == "A/B test “New headline”: “Bold” beats the original “Original”"
    assert facts[0]["numbers"] == {
        "visitors": 4000,
        "winnerConversionPct": 8.0,
        "originalConversionPct": 5.0,
        "liftPct": 60,
        "chanceBestPct": 100,
    }


async def test_rule_insight_for_a_winner_passes_the_number_check(monkeypatch):
    facts = await _experiment_facts(monkeypatch, [_decided()])
    insights = insight_service.rule_insights(facts)
    assert insights[0]["type"] == "opportunity" and insights[0]["priority"] == "high"
    assert "+60%" in insights[0]["description"]
    assert insight_service.validate(insights, facts) == insights


def test_a_winner_raises_an_alert():
    alert = judge_experiment_winner("a.com", _decided())
    assert alert.kind == "experiment_winner"
    assert alert.title == "A/B test result: Bold wins New headline"
    assert "+60% conversions" in alert.message and "4000 visitors" in alert.message
    assert alert.link == "/dashboard/experiments"
    assert judge_experiment_winner("a.com", None) is None
    assert judge_experiment_winner("a.com", {"name": "x", "result": {"winner": None}}) is None
