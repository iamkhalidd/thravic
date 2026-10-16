"""Owner alerts: sign-ups, new domains and subscriptions are emailed to the owner."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.services import email_service

PERIOD_END = datetime(2026, 11, 16, tzinfo=UTC)


@pytest.fixture
def sent(monkeypatch):
    messages: list[dict] = []

    async def _send(to, subject, html, text="", reply_to=""):
        messages.append(
            {"to": to, "subject": subject, "html": html, "text": text, "reply_to": reply_to}
        )

    monkeypatch.setattr(email_service, "send_email", _send)
    monkeypatch.setattr(
        email_service, "get_settings",
        lambda: SimpleNamespace(OWNER_NOTIFY_EMAIL="owner@example.com",
                                FRONTEND_URL="https://thravic.com"),
    )
    return messages


async def test_a_sign_up_is_emailed_to_the_owner(sent):
    await email_service.send_owner_signup_alert("Ada", "ada@example.com", "google")

    message = sent[0]
    assert message["to"] == "owner@example.com"
    assert message["subject"] == "New sign-up: Ada"
    assert "ada@example.com" in message["text"] and "Google" in message["text"]
    assert message["reply_to"] == "ada@example.com"


async def test_a_new_domain_is_emailed_to_the_owner(sent):
    await email_service.send_owner_domain_alert("Ada", "ada@example.com", "shop.example", "web")

    assert sent[0]["subject"] == "New domain added: shop.example"
    assert "Website" in sent[0]["text"]


async def test_a_subscription_is_emailed_to_the_owner(sent):
    await email_service.send_owner_subscription_alert(
        "Ada", "ada@example.com", "Pro", 15000, "NGN", "ref_123", PERIOD_END
    )

    assert sent[0]["subject"] == "New subscription: Pro by Ada"
    assert "NGN 15,000.00" in sent[0]["text"] and "ref_123" in sent[0]["text"]


async def test_names_are_escaped_in_html(sent):
    await email_service.send_owner_signup_alert('<a href="https://evil.example">x</a>', "a@b.c")

    assert '<a href="https://evil.example">' not in sent[0]["html"]


async def test_no_owner_address_sends_nothing(sent, monkeypatch):
    monkeypatch.setattr(
        email_service, "get_settings", lambda: SimpleNamespace(OWNER_NOTIFY_EMAIL="")
    )
    await email_service.send_owner_signup_alert("Ada", "ada@example.com")

    assert sent == []


async def test_a_failed_send_does_not_raise(monkeypatch):
    async def _boom(*args, **kwargs):
        raise RuntimeError("mail down")

    monkeypatch.setattr(email_service, "send_email", _boom)
    monkeypatch.setattr(
        email_service, "get_settings",
        lambda: SimpleNamespace(OWNER_NOTIFY_EMAIL="owner@example.com",
                                FRONTEND_URL="https://thravic.com"),
    )
    await email_service.send_owner_signup_alert("Ada", "ada@example.com")
