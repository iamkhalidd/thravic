"""Retention cohorts, Slack/Zapier webhooks, visitor timelines and feedback —
the pure parts, no database."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from app.routers.collect import _clean_data, webhook_events
from app.routers.domains import _validate_settings
from app.routers.webhooks import _kind_error
from app.services import domain_service, feedback_service, webhook_service
from app.services.cohort_service import build_cohorts, week_start
from app.services.visitor_profile_service import timeline_item

MONDAY = datetime(2026, 10, 26, tzinfo=UTC)


# ── Retention ────────────────────────────────────────────────────────────────


def test_week_start_is_monday_midnight_utc():
    assert week_start(datetime(2026, 10, 28, 15, 30, tzinfo=UTC)) == MONDAY
    assert week_start(datetime(2026, 11, 1, 23, 59, tzinfo=UTC)) == MONDAY
    assert week_start(MONDAY) == MONDAY


def test_cohorts_report_only_weeks_that_have_started():
    w0 = datetime(2026, 10, 12, tzinfo=UTC)  # two weeks before this one
    w1 = datetime(2026, 10, 19, tzinfo=UTC)
    result = build_cohorts(
        sizes={w0: 10, w1: 4},
        returns=[
            {"week": w0, "offset": 1, "visitors": 5},
            {"week": w0, "offset": 2, "visitors": 2},
            {"week": w1, "offset": 1, "visitors": 1},
        ],
        now=datetime(2026, 10, 28, tzinfo=UTC),
        weeks=3,
    )

    assert [c["week"] for c in result["cohorts"]] == ["2026-10-12", "2026-10-19", "2026-10-26"]
    first, second, current = result["cohorts"]
    assert first["visitors"] == 10
    assert first["weeks"] == [{"count": 5, "percent": 50.0}, {"count": 2, "percent": 20.0}]
    assert second["weeks"] == [{"count": 1, "percent": 25.0}]
    assert current == {"week": "2026-10-26", "visitors": 0, "weeks": []}


def test_headline_rates_only_count_finished_weeks():
    w0 = datetime(2026, 10, 12, tzinfo=UTC)
    w1 = datetime(2026, 10, 19, tzinfo=UTC)
    result = build_cohorts(
        sizes={w0: 10, w1: 10},
        returns=[
            {"week": w0, "offset": 1, "visitors": 4},
            # w1's week 1 is still under way, so it must not count
            {"week": w1, "offset": 1, "visitors": 1},
        ],
        now=datetime(2026, 10, 28, tzinfo=UTC),
        weeks=3,
    )
    assert result["week1"] == 40.0
    assert result["week4"] is None


def test_empty_cohorts_have_no_rates():
    result = build_cohorts({}, [], MONDAY, 8)
    assert len(result["cohorts"]) == 8
    assert result["week1"] is None
    assert all(c["visitors"] == 0 for c in result["cohorts"])


# ── Slack and Zapier ─────────────────────────────────────────────────────────


def test_slack_needs_a_slack_url_and_only_alerts_or_feedback():
    slack = "https://hooks.slack.com/services/T/B/x"
    assert _kind_error("slack", slack, ["alert", "feedback"]) is None
    assert _kind_error("slack", "https://example.com/hook", ["alert"]) is not None
    assert _kind_error("slack", "https://hooks.slack.com.evil.com/x", ["alert"]) is not None
    assert _kind_error("slack", slack, ["pageview"]) == "Slack can receive alerts and feedback only"
    assert _kind_error("zapier", "https://hooks.zapier.com/hooks/catch/1/a", ["pageview"]) is None
    assert _kind_error("custom", "https://example.com", ["click"]) is None
    assert _kind_error("teams", "https://example.com", ["click"]) is not None


def test_slack_alert_message():
    message = webhook_service.slack_message(
        "alert",
        {
            "title": "Traffic dropped <50%>",
            "message": "Fewer visitors than a normal Tuesday",
            "link": "https://thravic.com/dashboard?site=1",
            "recordings": ["https://thravic.com/r/1"],
        },
        "example.com",
    )
    lines = message["text"].split("\n")
    assert lines[0] == "*Traffic dropped &lt;50%&gt;*"
    assert lines[1] == "Fewer visitors than a normal Tuesday"
    assert "<https://thravic.com/dashboard?site=1|Open in Thravic>" in lines[2]
    assert "<https://thravic.com/r/1|Recording 1>" in lines[2]


def test_slack_feedback_message():
    message = webhook_service.slack_message(
        "feedback",
        {"url": "https://example.com/pricing", "data": {"answer": "no", "comment": "No prices"}},
        "example.com",
    )
    assert message["text"].split("\n") == [
        "New feedback on example.com: *:thumbsdown: No*",
        "> No prices",
        "Page: https://example.com/pricing",
    ]


def test_slack_requests_are_unsigned_messages_and_custom_ones_signed_json():
    slack = {"kind": "slack", "secret": "s", "domain": "example.com"}
    headers, body = webhook_service.build_request(slack, "d1", "alert", {"title": "Hi"})
    assert "X-Thravic-Signature" not in headers
    assert json.loads(body) == {"text": "*Hi*"}

    custom = {"kind": "custom", "secret": "s"}
    headers, body = webhook_service.build_request(custom, "d1", "alert", {"title": "Hi"})
    assert "X-Thravic-Signature" in headers
    payload = json.loads(body)
    assert payload["event"] == "alert"
    assert payload["data"] == {"title": "Hi"}


# ── Feedback ─────────────────────────────────────────────────────────────────


def test_feedback_clean_bounds_what_is_stored():
    assert feedback_service.clean({"answer": "yes", "comment": "  Great  ", "x": 1}) == {
        "event": "feedback",
        "answer": "yes",
        "comment": "Great",
    }
    cleaned = feedback_service.clean({"answer": "maybe", "comment": "a" * 5000, "question": "Q?"})
    assert cleaned["answer"] == "no"
    assert len(cleaned["comment"]) == feedback_service.COMMENT_MAX_LENGTH
    assert cleaned["question"] == "Q?"
    assert "comment" not in feedback_service.clean({"answer": "yes", "comment": "   "})


def test_feedback_by_page_merges_query_strings():
    pages = feedback_service.by_page([
        {"url": "https://example.com/a?x=1", "yes": 1, "no": 1},
        {"url": "https://example.com/a?x=2", "yes": 2, "no": 0},
        {"url": "https://example.com/b", "yes": 0, "no": 1},
    ])
    assert pages[0] == {"path": "/a", "yes": 3, "no": 1, "percentYes": 75}
    assert pages[1]["path"] == "/b"


def test_feedback_answers_are_also_a_feedback_webhook_event():
    event = {"url": "https://example.com/", "data": {"event": "feedback", "answer": "yes"}}
    assert [kind for kind, _ in webhook_events("custom", event)] == ["custom", "feedback"]
    other = {"url": "https://example.com/", "data": {"event": "signup"}}
    assert webhook_events("custom", other) == [("custom", other)]
    assert webhook_events("pageview", {"data": {}}) == [("pageview", {"data": {}})]


def test_feedback_events_are_cleaned_on_collection():
    data = _clean_data("custom", {"event": "feedback", "answer": "yes", "junk": "x"})
    assert data == {"event": "feedback", "answer": "yes"}


def test_feedback_question_setting():
    settings, error = _validate_settings({"feedbackQuestion": "  Was this useful?  "})
    assert error is None and settings == {"feedbackQuestion": "Was this useful?"}
    assert _validate_settings({"feedbackQuestion": "   "})[1] is not None
    assert _validate_settings({"feedbackQuestion": "x" * 121})[1] is not None
    assert _validate_settings({"feedbackWidget": "yes"})[1] is not None

    effective = domain_service.effective_settings({"settings": {"feedbackQuestion": "  "}})
    assert effective["feedbackQuestion"] == domain_service.DEFAULT_SETTINGS["feedbackQuestion"]
    assert effective["feedbackWidget"] is False


# ── Visitor timeline ─────────────────────────────────────────────────────────


def _event(type_: str, data: dict | None = None, url: str = "https://example.com/a") -> dict:
    return {"type": type_, "data": data or {}, "url": url, "session_id": "s1", "created_at": MONDAY}


def test_timeline_items():
    assert timeline_item(_event("pageview"))["label"] == "https://example.com/a"
    error = timeline_item(_event("custom", {"event": "error", "message": "x is undefined"}))
    assert (error["type"], error["label"]) == ("error", "x is undefined")
    rage = timeline_item(_event("custom", {"event": "rage_click", "selector": "#buy"}))
    assert (rage["type"], rage["label"]) == ("rage_click", "#buy")
    answer = {"event": "feedback", "answer": "yes", "comment": "ok"}
    feedback = timeline_item(_event("custom", answer))
    assert (feedback["type"], feedback["label"]) == ("feedback", "Yes: ok")
    custom = timeline_item(_event("custom", {"event": "signup"}))
    assert (custom["type"], custom["label"]) == ("event", "signup")
    form = timeline_item(_event("form", {"formName": "contact"}))
    assert (form["type"], form["label"]) == ("form", "contact")
    assert timeline_item(_event("custom", {"event": "x" * 500}))["label"] == "x" * 300
