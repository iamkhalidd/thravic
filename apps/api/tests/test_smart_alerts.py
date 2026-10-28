"""Smart alerts: when each check fires, what the email says, and which switches apply."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.jobs.smart_alerts import wants
from app.services import email_service
from app.services.alert_service import (
    Alert,
    judge_new_errors,
    judge_rage_clicks,
    judge_slow_pages,
    judge_traffic,
)

TUESDAY = datetime(2026, 10, 27, 12, tzinfo=UTC)


def test_a_normal_day_raises_nothing():
    assert judge_traffic("a.com", 38, [40, 35, 42, 37], TUESDAY) is None


def test_a_small_site_is_never_judged():
    # Normal is 4 sessions: 0 now is noise, not an outage
    assert judge_traffic("a.com", 0, [4, 3, 5, 4], TUESDAY) is None


def test_traffic_at_half_of_normal_is_a_drop():
    alert = judge_traffic("a.com", 15, [40, 35, 42, 37], TUESDAY)
    assert alert.kind == "traffic_drop"
    assert alert.title == "Traffic is down 61% on a.com"
    assert "normal Tuesday" in alert.message


def test_no_sessions_at_all_means_tracking_stopped():
    alert = judge_traffic("a.com", 0, [40, 35, 42, 37], TUESDAY)
    assert alert.kind == "silent" and alert.link == "/dashboard/tracking"


def test_one_odd_week_does_not_move_normal():
    # The median ignores the one week a post went viral
    assert judge_traffic("a.com", 40, [40, 35, 900, 37], TUESDAY) is None


def test_a_spike_names_its_source():
    alert = judge_traffic("a.com", 120, [40, 35, 42, 37], TUESDAY, "twitter.com")
    assert alert.kind == "traffic_spike"
    assert "twitter.com" in alert.message


def test_a_new_error_needs_several_visitors():
    one = [{"message": "x is undefined", "visitors": 2, "page": "/", "session_ids": ["s"]}]
    assert judge_new_errors("a.com", one) is None

    rows = [
        {"message": "x is undefined", "visitors": 7, "page": "/checkout", "session_ids": ["s1"]},
        {"message": "y failed", "visitors": 3, "page": "/", "session_ids": []},
    ]
    alert = judge_new_errors("a.com", rows)
    assert alert.kind == "new_error" and alert.sessions == ["s1"]
    assert "/checkout" in alert.message and "1 other new error" in alert.message


def test_rage_clicks_against_a_normal_day():
    usual = [{"page": "/pay", "today": 6, "week": 35, "element": "Pay", "session_ids": []}]
    assert judge_rage_clicks("a.com", usual) is None  # 5 a day is normal here

    sudden = [{"page": "/pay", "today": 9, "week": 7, "element": "Pay", "session_ids": ["s"]}]
    alert = judge_rage_clicks("a.com", sudden)
    assert alert.kind == "rage_clicks" and '"Pay"' in alert.message


def test_a_page_twice_as_slow_is_flagged():
    row = {"page": "/", "now_ms": 5200.0, "now_n": 30, "before_ms": 2100.0, "before_n": 200}
    alert = judge_slow_pages("a.com", [row])
    assert alert.kind == "slow_page" and "5.2s" in alert.message and "2.1s" in alert.message

    fast = {**row, "now_ms": 1800.0, "before_ms": 700.0}  # slower, but still quick
    few = {**row, "now_n": 3}
    assert judge_slow_pages("a.com", [fast, few]) is None


def test_switches_are_on_unless_turned_off():
    assert wants(None, "new_error")
    assert wants({"trafficAlerts": False}, "new_error")
    assert not wants({"errorAlerts": False}, "new_error")
    assert not wants({"trafficAlerts": False}, "silent")


@pytest.fixture
def sent(monkeypatch):
    messages: list[dict] = []

    async def _send(to, subject, html, text="", reply_to=""):
        messages.append({"to": to, "subject": subject, "html": html, "text": text})

    monkeypatch.setattr(email_service, "send_email", _send)
    return messages


async def test_one_email_for_all_sites(sent):
    drop = Alert("traffic_drop", "Traffic is down", "15 sessions…", "/dashboard/traffic/trends")
    error = Alert("new_error", "Error <b>", "boom", "/dashboard/errors", recordings=["r1", "r2"])
    await email_service.send_alerts_email(
        "a@b.c",
        "Ada",
        [
            {"domain": "a.com", "domain_id": "d1", "alert": drop},
            {"domain": "b.com", "domain_id": "d2", "alert": error},
        ],
    )

    assert len(sent) == 1
    message = sent[0]
    assert message["subject"] == "2 things need your attention"
    assert "/dashboard/traffic/trends?site=d1" in message["text"]
    assert "/dashboard/sessions?site=d2&recording=r2" in message["text"]
    assert "<b>" not in message["html"]  # escaped
