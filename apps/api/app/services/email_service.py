"""Transactional email — port of `services/emailService.ts`.

Provider precedence mirrors Express: Resend (HTTP, works on serverless) first,
then SMTP, then a development fallback that logs the message.

Every send is fire-and-forget at the call sites (`.catch(log.warn)` in Express),
so a delivery failure never changes an API response.
"""

from __future__ import annotations

import html
import smtplib
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from typing import Any

import anyio
import httpx

from ..config import get_settings
from ..logging import create_logger

log = create_logger("Email")

RESEND_ENDPOINT = "https://api.resend.com/emails"


class EmailSendError(RuntimeError):
    """Raised by `send_email_or_raise` when a configured provider fails."""


def _sender() -> str:
    return get_settings().SMTP_FROM or "Thravic <onboarding@resend.dev>"


async def _send_via_resend(api_key: str, to: str, subject: str, html: str) -> tuple[bool, str]:
    """Returns `(ok, error_message)`; the message is empty on success."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                RESEND_ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}"},
                json={"from": _sender(), "to": [to], "subject": subject, "html": html},
            )
        if response.status_code >= 400:
            log.error(f"Resend error → {to}: {response.text[:200]}")
            return False, response.text[:200]
        log.info(f'Email sent via Resend — "{subject}" → {to}')
        return True, ""
    except Exception as exc:
        log.error(f"Resend FAILED → {to}: {exc}")
        return False, str(exc)


def _send_via_smtp_sync(to: str, subject: str, html: str) -> tuple[bool, str]:
    """Returns `(ok, error_message)`; the message is empty on success."""
    settings = get_settings()
    if not (settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASS):
        return False, "No SMTP provider configured"

    message = EmailMessage()
    message["From"] = _sender()
    message["To"] = to
    message["Subject"] = subject
    message.set_content(html, subtype="html")

    try:
        port = settings.SMTP_PORT or 587
        with smtplib.SMTP(settings.SMTP_HOST, port, timeout=15) as server:
            if port != 465:
                server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASS)
            server.send_message(message)
        log.info(f'Email sent via SMTP — "{subject}" → {to}')
        return True, ""
    except Exception as exc:
        log.error(f"SMTP FAILED → {to}: {exc}")
        return False, str(exc)


async def send_email(to: str, subject: str, html: str, text: str = "") -> None:
    """Deliver an email using Resend, then SMTP, then the dev fallback."""
    settings = get_settings()

    if settings.RESEND_API_KEY:
        ok, _ = await _send_via_resend(settings.RESEND_API_KEY, to, subject, html)
        if ok:
            return

    ok, _ = await anyio.to_thread.run_sync(_send_via_smtp_sync, to, subject, html)
    if ok:
        return

    log.warning("No email provider configured (set RESEND_API_KEY or SMTP_HOST)")
    log.info(f"[DEV EMAIL] To: {to} | Subject: {subject}")
    log.info(f"[DEV EMAIL] {text or html}")


async def send_email_or_raise(to: str, subject: str, html: str, text: str = "") -> None:
    """Express-compatible send that surfaces provider failures.

    `send_email` above degrades gracefully because every call site mirrors the
    Express `.catch(log.warn)`. The `/api/test-email` diagnostic is the one
    caller that *did* see failures: Express's `sendEmail` throws when a
    configured provider rejects, and falls back to a console log only when no
    provider is configured at all. This variant reproduces that split so the
    endpoint can answer 500 like Express did.

    DEVIATION: the error *message* text comes from httpx/smtplib rather than the
    Resend SDK / nodemailer, so it is not byte-identical to Express.
    """
    settings = get_settings()

    if settings.RESEND_API_KEY:
        ok, error = await _send_via_resend(settings.RESEND_API_KEY, to, subject, html)
        if not ok:
            raise EmailSendError(error)
        return

    if settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASS:
        ok, error = await anyio.to_thread.run_sync(_send_via_smtp_sync, to, subject, html)
        if not ok:
            raise EmailSendError(error)
        return

    log.warning("No email provider configured (set RESEND_API_KEY or SMTP_HOST)")
    log.info(f"[DEV EMAIL] To: {to} | Subject: {subject}")
    log.info(f"[DEV EMAIL] {text or html}")


# ── Shared layout ────────────────────────────────────────────────────────────


def _layout(body_html: str) -> str:
    return (
        '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">'
        f"{body_html}"
        "</div>"
    )


# ── Templates (subjects match the TS implementation) ─────────────────────────


async def send_welcome_email(to: str, name: str) -> None:
    await send_email(
        to,
        "Welcome to Thravic",
        _layout(f"<h2>Welcome, {name}!</h2><p>Your Thravic account is ready to go.</p>"),
        f"Welcome, {name}!",
    )


async def send_login_alert_email(
    to: str, name: str, ip: str, user_agent: str, when: Any
) -> None:
    await send_email(
        to,
        "New sign-in to your Thravic account",
        _layout(
            f"<h2>New sign-in detected</h2><p>Hi {name},</p>"
            f"<p>IP: {ip}<br/>Device: {user_agent}<br/>Time: {when}</p>"
        ),
        f"New sign-in from {ip}",
    )


async def send_password_reset_email(to: str, reset_link: str) -> None:
    await send_email(
        to,
        "Reset your Thravic password",
        _layout(
            "<h2>Reset your password</h2>"
            f'<p><a href="{reset_link}">Choose a new password</a></p>'
            "<p>This link expires in 1 hour.</p>"
        ),
        f"Reset link: {reset_link}",
    )


async def send_password_changed_email(to: str, name: str, ip: str) -> None:
    await send_email(
        to,
        "Your Thravic password was changed",
        _layout(
            f"<h2>Password changed</h2><p>Hi {name},</p>"
            f"<p>Your password was changed from IP {ip}.</p>"
        ),
        f"Password changed from {ip}",
    )


def _js_date_string(value: datetime) -> str:
    """`Date.prototype.toDateString()` -> `Wed Oct 17 2026`.

    Note the day is **not** zero-padded here, unlike `Date.prototype.toString()`.
    """
    utc = value.astimezone(UTC)
    weekday = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")[utc.weekday()]
    month = (
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    )[utc.month - 1]
    return f"{weekday} {month} {utc.day} {utc.year}"


async def send_account_suspended_email(to: str, name: str) -> None:
    await send_email(
        to,
        "⚠️ Your Thravic account has been suspended",
        _layout(
            "<h2>Account suspended</h2>"
            f"<p>Hi {name}, your Thravic account has been suspended and you will "
            "no longer be able to log in.</p>"
            "<p>If you believe this is a mistake, please contact us and we'll "
            "review your account.</p>"
        ),
        f"Hi {name},\n\nYour Thravic account has been suspended. Please contact "
        "support@thravic.app if you believe this is a mistake.",
    )


async def send_account_reactivated_email(to: str, name: str) -> None:
    frontend_url = get_settings().FRONTEND_URL or "http://localhost:3000"
    await send_email(
        to,
        "✅ Your Thravic account has been reactivated",
        _layout(
            "<h2>Account reactivated</h2>"
            f"<p>Hi {name}, your Thravic account has been reactivated and you can "
            "now sign in again.</p>"
            f'<p><a href="{frontend_url}/login">Sign in</a></p>'
        ),
        f"Hi {name},\n\nGreat news! Your Thravic account has been reactivated. "
        f"You can now log in at {frontend_url}/login",
    )


async def send_payment_receipt_email(
    to: str, name: str, plan: str, amount: Any, reference: str
) -> None:
    frontend_url = get_settings().FRONTEND_URL or "http://localhost:3000"
    plan_label = plan[:1].upper() + plan[1:]

    period_end = datetime.now(UTC) + timedelta(days=30)
    period_end_label = _js_date_string(period_end)

    await send_email(
        to,
        f"🎉 Thravic — Payment confirmed ({plan_label} plan)",
        _layout(
            "<h2>Payment confirmed</h2>"
            f"<p>Hi {name}, your payment was successful and your account has been "
            "upgraded!</p>"
            f"<p>Plan: {plan_label}<br/>Amount: ${amount} USD<br/>"
            f"Reference: {reference}<br/>Next billing: {period_end_label}</p>"
        ),
        f"Hi {name},\n\nPayment confirmed! You've been upgraded to the "
        f"{plan_label} plan.\n\nAmount: ${amount} USD\nPlan: {plan_label}\n"
        f"Reference: {reference}\nNext billing: {period_end_label}\n\n"
        f"Manage your subscription at {frontend_url}/dashboard/settings",
    )


async def send_usage_limit_email(
    to: str, name: str, threshold: int, used: int, limit: int, plan: str
) -> None:
    """Monthly event allowance at 80% or used up. Raises if the provider rejects it,
    so the caller can try again later instead of losing the notice."""
    frontend_url = get_settings().FRONTEND_URL or "http://localhost:3000"
    billing_url = f"{frontend_url}/dashboard/settings"
    used_text, limit_text = f"{used:,}", f"{limit:,}"
    safe_name, safe_plan = html.escape(name or "there"), html.escape(plan.capitalize())

    if threshold >= 100:
        subject = "Your Thravic event limit has been reached"
        lead = (
            f"Your sites have sent {used_text} events this month, the {limit_text} included in "
            f"the {safe_plan} plan. <strong>New events and session recordings are not being "
            "stored</strong> until the 1st of next month (UTC), or until you upgrade."
        )
        text_lead = (
            f"Your sites have sent {used_text} events this month, the {limit_text} included in "
            f"the {plan.capitalize()} plan. New events and session recordings are not being "
            "stored until the 1st of next month (UTC), or until you upgrade."
        )
    else:
        subject = f"You have used {threshold}% of your Thravic events this month"
        lead = (
            f"Your sites have sent {used_text} of the {limit_text} events included in the "
            f"{safe_plan} plan this month. When the allowance runs out, new events stop being "
            "stored until the 1st (UTC)."
        )
        text_lead = (
            f"Your sites have sent {used_text} of the {limit_text} events included in the "
            f"{plan.capitalize()} plan this month. When the allowance runs out, new events stop "
            "being stored until the 1st (UTC)."
        )

    await send_email_or_raise(
        to,
        subject,
        _layout(
            f"<h2>{html.escape(subject)}</h2>"
            f"<p>Hi {safe_name},</p>"
            f"<p>{lead}</p>"
            f'<p><a href="{billing_url}">See usage and plans</a></p>'
        ),
        f"Hi {name or 'there'},\n\n{text_lead}\n\nSee usage and plans: {billing_url}",
    )
