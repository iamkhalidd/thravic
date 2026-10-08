"""The usage-limit email's content — and that user-supplied names are escaped."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.services import email_service

RENEWS = datetime(2026, 11, 3, tzinfo=UTC)


@pytest.fixture
def sent(monkeypatch):
    messages: list[dict] = []

    async def _send(to, subject, html, text=""):
        messages.append({"to": to, "subject": subject, "html": html, "text": text})

    monkeypatch.setattr(email_service, "send_email_or_raise", _send)
    return messages


async def test_the_100_percent_email_says_collection_has_stopped(sent):
    await email_service.send_usage_limit_email("a@b.c", "Ada", 100, 5_012, 5_000, "Hobby", RENEWS)

    message = sent[0]
    assert message["subject"] == "Your Thravic event limit has been reached"
    assert "5,012" in message["text"] and "not being stored" in message["text"]
    assert "renews on Tue Nov 3 2026" in message["text"]  # the plan's cycle, not "the 1st"


async def test_the_80_percent_email_warns_ahead(sent):
    await email_service.send_usage_limit_email("a@b.c", "Ada", 80, 80_000, 100_000, "Pro", RENEWS)

    assert sent[0]["subject"] == "You have used 80% of your Thravic events"
    assert "80,000 of the 100,000" in sent[0]["text"]


async def test_the_name_is_escaped_in_html(sent):
    await email_service.send_usage_limit_email(
        "a@b.c", '<a href="https://evil.example">claim</a>', 80, 8, 10, "Pro", RENEWS
    )

    assert '<a href="https://evil.example">' not in sent[0]["html"]
    assert "&lt;a href=" in sent[0]["html"]
