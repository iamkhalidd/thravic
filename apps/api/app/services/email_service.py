"""Transactional email — port of `services/emailService.ts`.

Provider precedence mirrors Express: Resend (HTTP, works on serverless) first,
then SMTP, then a development fallback that logs the message.

Every send is fire-and-forget at the call sites (`.catch(log.warn)` in Express),
so a delivery failure never changes an API response.

Every template goes through `_render`: the landing page's fluted-glass hero as
the background (a still frame served by the web app from `/email/`), the
wordmark, and one card of content. Anything that came from a user (names, site
names, messages) is escaped before it reaches the HTML.
"""

from __future__ import annotations

import html
import re
import smtplib
from collections.abc import Sequence
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


async def _send_via_resend(
    api_key: str, to: str, subject: str, html_body: str, text: str = ""
) -> tuple[bool, str]:
    """Returns `(ok, error_message)`; the message is empty on success."""
    payload: dict[str, Any] = {"from": _sender(), "to": [to], "subject": subject, "html": html_body}
    if text:
        payload["text"] = text
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                RESEND_ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
        if response.status_code >= 400:
            log.error(f"Resend error → {to}: {response.text[:200]}")
            return False, response.text[:200]
        log.info(f'Email sent via Resend — "{subject}" → {to}')
        return True, ""
    except Exception as exc:
        log.error(f"Resend FAILED → {to}: {exc}")
        return False, str(exc)


def _send_via_smtp_sync(to: str, subject: str, html_body: str, text: str = "") -> tuple[bool, str]:
    """Returns `(ok, error_message)`; the message is empty on success."""
    settings = get_settings()
    if not (settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASS):
        return False, "No SMTP provider configured"

    message = EmailMessage()
    message["From"] = _sender()
    message["To"] = to
    message["Subject"] = subject
    # Plain text first, HTML as the preferred alternative
    if text:
        message.set_content(text)
        message.add_alternative(html_body, subtype="html")
    else:
        message.set_content(html_body, subtype="html")

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
        ok, _ = await _send_via_resend(settings.RESEND_API_KEY, to, subject, html, text)
        if ok:
            return

    ok, _ = await anyio.to_thread.run_sync(_send_via_smtp_sync, to, subject, html, text)
    if ok:
        return

    log.warning("No email provider configured (set RESEND_API_KEY or SMTP_HOST)")
    log.info(f"[DEV EMAIL] To: {to} | Subject: {subject}")
    log.info(f"[DEV EMAIL] {text or html}")


async def send_email_or_raise(to: str, subject: str, html: str, text: str = "") -> None:
    """Express-compatible send that surfaces provider failures.

    `send_email` above degrades gracefully because every call site mirrors the
    Express `.catch(log.warn)`. Jobs that retry, and the `/api/test-email`
    diagnostic, need to see failures: this raises when a configured provider
    rejects, and falls back to a log line only when no provider is configured.

    DEVIATION: the error *message* text comes from httpx/smtplib rather than the
    Resend SDK / nodemailer, so it is not byte-identical to Express.
    """
    settings = get_settings()

    if settings.RESEND_API_KEY:
        ok, error = await _send_via_resend(settings.RESEND_API_KEY, to, subject, html, text)
        if not ok:
            raise EmailSendError(error)
        return

    if settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASS:
        ok, error = await anyio.to_thread.run_sync(_send_via_smtp_sync, to, subject, html, text)
        if not ok:
            raise EmailSendError(error)
        return

    log.warning("No email provider configured (set RESEND_API_KEY or SMTP_HOST)")
    log.info(f"[DEV EMAIL] To: {to} | Subject: {subject}")
    log.info(f"[DEV EMAIL] {text or html}")


# ── Layout ───────────────────────────────────────────────────────────────────

FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif"
PAGE_BG = "#0b0b0c"
CARD_BG = "#111113"
CARD_BORDER = "#26262a"
HEADING = "#f4f5f6"
BODY = "#c9ccd1"
MUTED = "#8a8f98"
POSITIVE = "#3fb950"
NEGATIVE = "#f85149"


def _frontend() -> str:
    return (get_settings().FRONTEND_URL or "http://localhost:3000").rstrip("/")


def _esc(value: Any) -> str:
    return html.escape(str(value))


def _p(inner_html: str, *, muted: bool = False, size: int = 15) -> str:
    """A paragraph; `inner_html` must already be escaped."""
    color = MUTED if muted else BODY
    return (
        f'<p style="margin:0 0 16px;font-family:{FONT};font-size:{size}px;'
        f'line-height:1.6;color:{color};">{inner_html}</p>'
    )


def _strong(text: str) -> str:
    return f'<strong style="color:{HEADING};">{_esc(text)}</strong>'


def _link(url: str, label: str) -> str:
    return (
        f'<a href="{_esc(url)}" style="color:{HEADING};text-decoration:underline;">'
        f"{_esc(label)}</a>"
    )


def _button(url: str, label: str) -> str:
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
        'style="margin:8px 0 24px;"><tr>'
        f'<td bgcolor="{HEADING}" style="border-radius:8px;">'
        f'<a href="{_esc(url)}" style="display:inline-block;padding:12px 22px;'
        f"font-family:{FONT};font-size:14px;font-weight:600;color:{PAGE_BG};"
        f'text-decoration:none;border-radius:8px;">{_esc(label)}</a>'
        "</td></tr></table>"
    )


def _details(rows: Sequence[tuple[str, str]]) -> str:
    """Label / value rows in a bordered box; both are escaped here."""
    cells = "".join(
        "<tr>"
        f'<td style="padding:10px 16px;font-family:{FONT};font-size:13px;color:{MUTED};'
        f"border-top:{'0' if i == 0 else '1px solid ' + CARD_BORDER};white-space:nowrap;"
        f'vertical-align:top;">{_esc(label)}</td>'
        f'<td style="padding:10px 16px;font-family:{FONT};font-size:14px;color:{HEADING};'
        f"border-top:{'0' if i == 0 else '1px solid ' + CARD_BORDER};"
        f'word-break:break-word;">{_esc(value)}</td>'
        "</tr>"
        for i, (label, value) in enumerate(rows)
    )
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="margin:4px 0 24px;border:1px solid {CARD_BORDER};'
        f'border-radius:10px;border-collapse:separate;">{cells}</table>'
    )


def _change(now: int, before: int) -> tuple[str, str]:
    """`("+12%", colour)` for a value against the previous period."""
    if before == 0:
        return ("New", POSITIVE) if now else ("No change", MUTED)
    pct = round((now - before) / before * 100)
    if pct == 0:
        return "No change", MUTED
    return (f"+{pct}%", POSITIVE) if pct > 0 else (f"−{abs(pct)}%", NEGATIVE)


def _render(
    *,
    subject: str,
    heading: str,
    blocks: Sequence[str],
    preheader: str = "",
    reason: str = "",
    manage_link: bool = False,
) -> str:
    """The full HTML document. `heading` is escaped; `blocks` are trusted HTML."""
    base = _frontend()
    background = f"{base}/email/background.jpg"
    footer = [_esc(reason)] if reason else []
    if manage_link:
        footer.append(
            _link(f"{base}/dashboard/settings?tab=notifications", "Manage email notifications")
        )
    footer.append(
        "Thravic &middot; Privacy-first web analytics &middot; "
        + _link(base, base.split("//")[-1])
    )
    footer_html = "".join(
        f'<p style="margin:0 0 8px;font-family:{FONT};font-size:12px;line-height:1.6;'
        f'color:{MUTED};">{line}</p>'
        for line in footer
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>{_esc(subject)}</title>
<style>
  @media (max-width:620px) {{
    .card {{ padding:28px 22px !important; }}
    .outer {{ padding:32px 12px !important; }}
  }}
</style>
</head>
<body style="margin:0;padding:0;background-color:{PAGE_BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{PAGE_BG};">{_esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{PAGE_BG}" background="{background}"
  style="background-color:{PAGE_BG};background-image:url('{background}');background-position:center top;background-size:cover;background-repeat:no-repeat;">
<tr><td class="outer" align="center" style="padding:56px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
    <tr><td style="padding:0 4px 28px;">
      <a href="{_esc(base)}" style="text-decoration:none;"><img src="{base}/email/logo.png" width="112" height="24" alt="thravic." style="display:block;border:0;width:112px;height:24px;"></a>
    </td></tr>
    <tr><td class="card" bgcolor="{CARD_BG}" style="background-color:{CARD_BG};background-color:rgba(17,17,19,0.88);border:1px solid {CARD_BORDER};border-radius:16px;padding:40px;">
      <h1 style="margin:0 0 20px;font-family:{FONT};font-size:22px;line-height:1.3;font-weight:600;color:{HEADING};">{_esc(heading)}</h1>
      {''.join(blocks)}
    </td></tr>
    <tr><td style="padding:24px 4px 0;">{footer_html}</td></tr>
  </table>
</td></tr>
</table>
</body>
</html>"""


def _greeting(name: str | None) -> str:
    return _p(f"Hi {_esc(name or 'there')},")


def _when(value: Any) -> str:
    """`Fri, 9 Oct 2026, 11:53 UTC`; anything that isn't a datetime is shown as is."""
    if not isinstance(value, datetime):
        return str(value)
    utc = value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
    return f"{utc:%a}, {utc.day} {utc:%b %Y, %H:%M} UTC"


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


# ── Account ──────────────────────────────────────────────────────────────────


async def send_welcome_email(to: str, name: str) -> None:
    base = _frontend()
    subject = "Welcome to Thravic"
    await send_email(
        to,
        subject,
        _render(
            subject=subject,
            heading=f"Welcome to Thravic, {name or 'there'}",
            preheader="Add your site and see your first visitors in minutes.",
            blocks=[
                _p("Your account is ready. Add your website and paste the tracking snippet "
                   "into its pages; visits show up on your dashboard within seconds."),
                _button(f"{base}/dashboard/tracking", "Add your first site"),
                _p("No cookies and no personal data: Thravic counts visits without "
                   "tracking people.", muted=True, size=13),
            ],
        ),
        f"Welcome to Thravic, {name or 'there'}!\n\nYour account is ready. Add your website "
        f"and install the tracking snippet: {base}/dashboard/tracking",
    )


async def send_login_alert_email(
    to: str, name: str, ip: str, user_agent: str, when: Any
) -> None:
    base = _frontend()
    subject = "New sign-in to your Thravic account"
    await send_email(
        to,
        subject,
        _render(
            subject=subject,
            heading="New sign-in to your account",
            preheader=f"Signed in from {ip}.",
            blocks=[
                _greeting(name),
                _p("Your Thravic account was just signed in to:"),
                _details([("Time", _when(when)), ("IP address", ip), ("Device", user_agent)]),
                _p("If this was you, there's nothing to do. If it wasn't, reset your "
                   "password now."),
                _button(f"{base}/forgot-password", "Reset password"),
            ],
        ),
        f"Hi {name or 'there'},\n\nNew sign-in to your Thravic account.\n"
        f"Time: {_when(when)}\nIP: {ip}\nDevice: {user_agent}\n\n"
        f"If this wasn't you, reset your password: {base}/forgot-password",
    )


async def send_password_reset_email(to: str, reset_link: str, expires_minutes: int = 15) -> None:
    subject = "Reset your Thravic password"
    await send_email(
        to,
        subject,
        _render(
            subject=subject,
            heading="Reset your password",
            preheader=f"This link expires in {expires_minutes} minutes.",
            blocks=[
                _p("We received a request to reset the password for your Thravic account. "
                   f"The link works once and expires in {_strong(f'{expires_minutes} minutes')}."),
                _button(reset_link, "Choose a new password"),
                _p("If the button doesn't work, paste this into your browser:<br>"
                   f'<span style="word-break:break-all;color:{BODY};">{_esc(reset_link)}</span>',
                   muted=True, size=13),
                _p("Didn't ask for this? Ignore this email; your password stays the same.",
                   muted=True, size=13),
            ],
        ),
        f"Reset your Thravic password (expires in {expires_minutes} minutes):\n{reset_link}\n\n"
        "Didn't ask for this? Ignore this email; your password stays the same.",
    )


async def send_password_changed_email(to: str, name: str, ip: str) -> None:
    base = _frontend()
    subject = "Your Thravic password was changed"
    now = _when(datetime.now(UTC))
    await send_email(
        to,
        subject,
        _render(
            subject=subject,
            heading="Your password was changed",
            preheader=f"Changed from {ip}.",
            blocks=[
                _greeting(name),
                _p("The password for your Thravic account was just changed."),
                _details([("Time", now), ("IP address", ip)]),
                _p("If you didn't do this, reset your password right away and contact support."),
                _button(f"{base}/forgot-password", "Reset password"),
            ],
        ),
        f"Hi {name or 'there'},\n\nYour Thravic password was changed at {now} from {ip}.\n\n"
        f"If this wasn't you, reset it now: {base}/forgot-password",
    )


async def send_account_suspended_email(to: str, name: str) -> None:
    base = _frontend()
    subject = "Your Thravic account has been suspended"
    await send_email(
        to,
        subject,
        _render(
            subject=subject,
            heading="Your account has been suspended",
            blocks=[
                _greeting(name),
                _p("Your Thravic account has been suspended, so you can no longer sign in."),
                _p("If you believe this is a mistake, contact us and we'll review your account."),
                _button(f"{base}/contact", "Contact support"),
            ],
        ),
        f"Hi {name or 'there'},\n\nYour Thravic account has been suspended. Please contact "
        f"support if you believe this is a mistake: {base}/contact",
    )


async def send_account_reactivated_email(to: str, name: str) -> None:
    base = _frontend()
    subject = "Your Thravic account has been reactivated"
    await send_email(
        to,
        subject,
        _render(
            subject=subject,
            heading="Your account is active again",
            blocks=[
                _greeting(name),
                _p("Your Thravic account has been reactivated and you can sign in again."),
                _button(f"{base}/login", "Sign in"),
            ],
        ),
        f"Hi {name or 'there'},\n\nYour Thravic account has been reactivated. "
        f"You can now sign in at {base}/login",
    )


async def send_account_restricted_email(to: str, name: str, grace_days: int) -> None:
    """The account was restricted because its owner is under 18."""
    base = _frontend()
    subject = "Your Thravic account has been restricted"
    paragraphs = [
        "Thravic is only for people aged 18 or older, so your account has been "
        "restricted: the dashboard is locked and your sites have stopped collecting data.",
        f"The account and its data will be deleted in {grace_days} days. If your date of "
        "birth was entered by mistake, contact support before then and we'll correct it.",
    ]
    await send_email(
        to,
        subject,
        _render(
            subject=subject,
            heading=subject,
            blocks=[
                _greeting(name),
                *(_p(_esc(p)) for p in paragraphs),
                _button(f"{base}/contact", "Contact support"),
            ],
        ),
        f"Hi {name or 'there'},\n\n" + "\n\n".join(paragraphs)
        + f"\n\nContact support: {base}/contact",
    )


# ── Billing ──────────────────────────────────────────────────────────────────


async def send_payment_receipt_email(
    to: str,
    name: str,
    plan_name: str,
    amount: float,
    currency: str,
    reference: str,
    period_end: datetime,
) -> None:
    """Receipt for a one-off payment. `amount` is in currency units (naira, not
    kobo); `period_end` is when the paid period ends — renewals extend it."""
    base = _frontend()
    paid = f"{currency} {amount:,.2f}"
    ends = _js_date_string(period_end)
    subject = f"Thravic payment confirmed ({plan_name} plan)"
    await send_email(
        to,
        subject,
        _render(
            subject=subject,
            heading="Payment confirmed",
            preheader=f"{paid} for the {plan_name} plan.",
            blocks=[
                _greeting(name),
                _p("Thanks, your payment went through. Here's your receipt:"),
                _details([("Plan", plan_name), ("Amount", paid), ("Reference", reference),
                          ("Active until", ends)]),
                _p("Plans don't renew automatically. We'll email you a week before this date "
                   "so you can renew."),
                _button(f"{base}/dashboard/settings?tab=subscription", "Manage subscription"),
            ],
            reason="Keep this email as your receipt.",
        ),
        f"Hi {name or 'there'},\n\nPayment confirmed for the {plan_name} plan.\n\n"
        f"Amount: {paid}\nReference: {reference}\nActive until: {ends}\n\n"
        "Plans don't renew automatically; we'll email you a week before this date.\n\n"
        f"Manage your subscription at {base}/dashboard/settings?tab=subscription",
    )


async def send_subscription_notice_email(
    to: str,
    name: str,
    kind: str,
    *,
    plan_name: str,
    period_end: datetime,
    grace_days: int,
    free_plan_name: str = "Hobby",
    free_sites: int = 1,
    paused_sites: int = 0,
    data_hold_days: int = 90,
) -> None:
    """One email per stage of a paid period that is ending:

    `renew_7d` / `renew_1d` before the end, `grace_started` when it ends (access
    continues `grace_days` more), `downgraded` when the account falls back to the
    free plan. Raises if the provider rejects it, so the job can retry.
    """
    renew_url = f"{_frontend()}/dashboard/settings?tab=subscription"
    sites_url = f"{_frontend()}/dashboard/tracking"
    ends = _js_date_string(period_end)
    grace_ends = _js_date_string(period_end + timedelta(days=grace_days))
    plan, free = _esc(plan_name), _esc(free_plan_name)
    data_kept = (
        f"Your data is kept for {data_hold_days} days and everything comes back when you renew."
    )

    if kind in ("renew_7d", "renew_1d"):
        when = "tomorrow" if kind == "renew_1d" else f"on {ends}"
        subject = f"Your Thravic {plan_name} plan ends {when}"
        paragraphs = [
            f"Plans don't renew automatically. Renew before {ends} to keep your "
            f"{plan} features without a break.",
            f"If you don't, you keep access for {grace_days} more days, then the account "
            f"moves to the free {free} plan. {data_kept}",
        ]
        action = "Renew now"
    elif kind == "grace_started":
        subject = f"Your Thravic {plan_name} plan has ended: {grace_days} days to renew"
        paragraphs = [
            f"Your {plan} plan ended on {ends}. You keep full access until {grace_ends}.",
            f"After that the account moves to the free {free} plan. {data_kept}",
        ]
        action = "Renew now"
    elif kind == "downgraded":
        subject = f"Your Thravic account is now on the {free_plan_name} plan"
        paragraphs = [
            f"Your {plan} plan wasn't renewed, so on {grace_ends} the account moved to the "
            f"free {free} plan. Nothing was deleted. {data_kept}",
        ]
        if paused_sites:
            paragraphs.append(
                f"{free} covers {free_sites} website{'' if free_sites == 1 else 's'}, so "
                f"{paused_sites} of your sites stopped collecting. Their data stays; you can "
                f"choose which site keeps collecting on the {_link(sites_url, 'Tracking')} page."
            )
        action = f"Renew {plan_name}"
    else:
        raise ValueError(f"Unknown subscription notice {kind!r}")

    text = "\n\n".join(html.unescape(re.sub(r"<[^>]+>", "", p)) for p in paragraphs)
    await send_email_or_raise(
        to,
        subject,
        _render(
            subject=subject,
            heading=subject,
            blocks=[_greeting(name), *(_p(p) for p in paragraphs), _button(renew_url, action)],
        ),
        f"Hi {name or 'there'},\n\n{text}\n\n{action}: {renew_url}",
    )


async def send_usage_limit_email(
    to: str,
    name: str,
    threshold: int,
    used: int,
    limit: int,
    plan: str,
    resets_at: datetime,
) -> None:
    """Event allowance at 80% or used up. `resets_at` is when the allowance renews
    (the plan's billing cycle, or the 1st for free accounts). Raises if the
    provider rejects it, so the caller can try again later instead of losing it."""
    billing_url = f"{_frontend()}/dashboard/settings?tab=subscription"
    used_text, limit_text = f"{used:,}", f"{limit:,}"
    safe_plan = _esc(plan)
    renews = _js_date_string(resets_at)

    if threshold >= 100:
        subject = "Your Thravic event limit has been reached"
        lead = (
            f"Your sites have sent {used_text} events, the {limit_text} included in the "
            f"{safe_plan} plan for this period. "
            f"{_strong('New events and session recordings are not being stored')} until the "
            f"allowance renews on {renews}, or until you upgrade."
        )
        text_lead = (
            f"Your sites have sent {used_text} events, the {limit_text} included in the "
            f"{plan} plan for this period. New events and session recordings are not being "
            f"stored until the allowance renews on {renews}, or until you upgrade."
        )
    else:
        subject = f"You have used {threshold}% of your Thravic events"
        lead = (
            f"Your sites have sent {used_text} of the {limit_text} events included in the "
            f"{safe_plan} plan for this period. If the allowance runs out, new events stop "
            f"being stored until it renews on {renews}."
        )
        text_lead = (
            f"Your sites have sent {used_text} of the {limit_text} events included in the "
            f"{plan} plan for this period. If the allowance runs out, new events stop being "
            f"stored until it renews on {renews}."
        )

    await send_email_or_raise(
        to,
        subject,
        _render(
            subject=subject,
            heading=subject,
            preheader=f"{used_text} of {limit_text} events used.",
            blocks=[_greeting(name), _p(lead), _button(billing_url, "See usage and plans")],
        ),
        f"Hi {name or 'there'},\n\n{text_lead}\n\nSee usage and plans: {billing_url}",
    )


# ── Notifications (Settings → Notifications) ─────────────────────────────────


async def send_traffic_alert_email(to: str, domain: str, kind: str, detail: str) -> None:
    """`kind` is "spike" or "drop"; `detail` is one sentence with the numbers."""
    base = _frontend()
    subject = f"Traffic {kind} on {domain}"
    await send_email(
        to,
        subject,
        _render(
            subject=subject,
            heading=subject,
            preheader=detail,
            blocks=[
                _p(f"We noticed a significant change in traffic for {_strong(domain)} "
                   "in the last hour."),
                _p(_esc(detail)),
                _button(f"{base}/dashboard/realtime", "See live traffic"),
            ],
            reason="You're receiving this because traffic alerts are on for your account.",
            manage_link=True,
        ),
        f"{subject}\n\n{detail}\n\nSee live traffic: {base}/dashboard/realtime",
    )


def _site_report(site: dict[str, Any]) -> str:
    """One site's week: three numbers with their change, then top page and source."""
    cells = []
    for label, key in (("Visitors", "visitors"), ("Sessions", "sessions"), ("Pageviews", "pageviews")):
        now, before = int(site.get(key) or 0), int(site.get(f"{key}_before") or 0)
        change, color = _change(now, before)
        cells.append(
            f'<td width="33%" style="padding:14px 16px;vertical-align:top;">'
            f'<div style="font-family:{FONT};font-size:12px;color:{MUTED};">{label}</div>'
            f'<div style="font-family:{FONT};font-size:22px;font-weight:600;color:{HEADING};'
            f'padding:4px 0 2px;">{now:,}</div>'
            f'<div style="font-family:{FONT};font-size:12px;font-weight:600;color:{color};">'
            f"{change}</div></td>"
        )
    extras = [
        (label, site[key])
        for label, key in (("Top page", "top_page"), ("Top source", "top_source"))
        if site.get(key)
    ]
    extra_html = "".join(
        f'<tr><td colspan="3" style="padding:0 16px 12px;font-family:{FONT};font-size:13px;'
        f'color:{MUTED};">{_esc(label)}: <span style="color:{BODY};">{_esc(value)}</span></td></tr>'
        for label, value in extras
    )
    return (
        f'<div style="font-family:{FONT};font-size:14px;font-weight:600;color:{HEADING};'
        f'margin:0 0 8px;">{_esc(site["domain"])}</div>'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="margin:0 0 20px;border:1px solid {CARD_BORDER};border-radius:10px;'
        f'border-collapse:separate;"><tr>{"".join(cells)}</tr>{extra_html}</table>'
    )


async def send_weekly_report_email(
    to: str, name: str, sites: Sequence[dict[str, Any]], week_start: datetime, week_end: datetime
) -> None:
    """Last week per site, each number against the week before. Raises on failure
    so the job can release its claim and retry."""
    base = _frontend()
    last_day = week_end - timedelta(days=1)
    period = f"{week_start.day} {week_start:%b} to {last_day.day} {last_day:%b %Y}"
    total = sum(int(s.get("visitors") or 0) for s in sites)
    subject = f"Your Thravic week: {total:,} visitor{'' if total == 1 else 's'}"
    lines = []
    for s in sites:
        change, _ = _change(int(s.get("visitors") or 0), int(s.get("visitors_before") or 0))
        lines.append(
            f"{s['domain']}: {int(s.get('visitors') or 0):,} visitors ({change}), "
            f"{int(s.get('sessions') or 0):,} sessions, {int(s.get('pageviews') or 0):,} pageviews"
        )
    await send_email_or_raise(
        to,
        subject,
        _render(
            subject=subject,
            heading="Your weekly report",
            preheader=f"{period}, compared with the week before.",
            blocks=[
                _greeting(name),
                _p(f"Here's how your sites did from {_esc(period)}, compared with the "
                   "week before."),
                *(_site_report(s) for s in sites),
                _button(f"{base}/dashboard", "Open dashboard"),
            ],
            reason="You're receiving this because weekly reports are on for your account.",
            manage_link=True,
        ),
        f"Hi {name or 'there'},\n\nYour Thravic week, {period}:\n\n" + "\n".join(lines)
        + f"\n\nOpen dashboard: {base}/dashboard",
    )


async def send_insight_alert_email(
    to: str, name: str, domain: str, insights: Sequence[dict[str, Any]]
) -> None:
    """High-priority insights for one site. Raises on failure so the job can retry."""
    base = _frontend()
    count = len(insights)
    subject = (
        f"{insights[0]['title']} ({domain})" if count == 1
        else f"{count} things need attention on {domain}"
    )
    items = "".join(
        f'<div style="border-left:2px solid {HEADING};padding:2px 0 2px 16px;margin:0 0 20px;">'
        f'<div style="font-family:{FONT};font-size:15px;font-weight:600;color:{HEADING};'
        f'margin:0 0 6px;">{_esc(i["title"])}</div>'
        f'<div style="font-family:{FONT};font-size:14px;line-height:1.6;color:{BODY};'
        f'margin:0 0 6px;">{_esc(i.get("description") or "")}</div>'
        f'<div style="font-family:{FONT};font-size:13px;line-height:1.6;color:{MUTED};">'
        f'Next step: {_esc(i.get("recommendation") or "")}</div></div>'
        for i in insights
    )
    text = "\n\n".join(
        f"{i['title']}\n{i.get('description') or ''}\nNext step: {i.get('recommendation') or ''}"
        for i in insights
    )
    await send_email_or_raise(
        to,
        subject,
        _render(
            subject=subject,
            heading=f"New insights for {domain}",
            preheader=insights[0]["title"],
            blocks=[
                _greeting(name),
                _p(f"Today's analysis of {_strong(domain)} found something worth a look:"),
                items,
                _button(f"{base}/dashboard/insights", "See all insights"),
            ],
            reason="You're receiving this because AI insight alerts are on for your account.",
            manage_link=True,
        ),
        f"Hi {name or 'there'},\n\nNew insights for {domain}:\n\n{text}\n\n"
        f"See all insights: {base}/dashboard/insights",
    )


def _message_blocks(message: str) -> list[str]:
    """Free text: paragraphs on blank lines, line breaks kept, all escaped."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", message.strip()) if p.strip()]
    return [_p(_esc(p).replace("\n", "<br>")) for p in paragraphs]


async def send_product_update_email(to: str, name: str, subject: str, message: str) -> None:
    """An announcement to someone who opted in to product updates. Raises on failure."""
    base = _frontend()
    await send_email_or_raise(
        to,
        subject,
        _render(
            subject=subject,
            heading=subject,
            preheader=message.strip().split("\n")[0][:120],
            blocks=[_greeting(name), *_message_blocks(message),
                    _button(f"{base}/dashboard", "Open Thravic")],
            reason="You're receiving this because product updates are on for your account.",
            manage_link=True,
        ),
        f"Hi {name or 'there'},\n\n{message.strip()}\n\n"
        f"Turn these off: {base}/dashboard/settings?tab=notifications",
    )


# ── Other mail ───────────────────────────────────────────────────────────────


async def send_direct_email(to: str, name: str, subject: str, message: str) -> None:
    """A message an admin wrote to one user."""
    await send_email(
        to,
        subject,
        _render(subject=subject, heading=subject,
                blocks=[_greeting(name), *_message_blocks(message)]),
        message,
    )


def contact_form_email(data: dict[str, Any]) -> tuple[str, str, str]:
    """`(subject, html, text)` for a contact form submission sent to the team."""
    subject = f"[Contact Form] {data['type']}: {data['subject']}"
    html_body = _render(
        subject=subject,
        heading="New contact form message",
        preheader=str(data["subject"]),
        blocks=[
            _details([("From", f"{data['name']} <{data['email']}>"), ("Type", str(data["type"])),
                      ("Subject", str(data["subject"]))]),
            *_message_blocks(str(data["message"])),
        ],
        reason="Sent from the Thravic contact form.",
    )
    text = (
        f"New contact form message\n\nName: {data['name']}\nEmail: {data['email']}\n"
        f"Type: {data['type']}\nSubject: {data['subject']}\n\nMessage:\n{data['message']}"
    )
    return subject, html_body, text


def diagnostic_email(sent_at: str, server: str) -> tuple[str, str, str]:
    """`(subject, html, text)` for the `/api/test-email` diagnostic."""
    subject = "Thravic test email"
    html_body = _render(
        subject=subject,
        heading="Email delivery is working",
        blocks=[_details([("Sent at", sent_at), ("Server", server)]),
                _p("If you can read this, your email provider is set up correctly.")],
    )
    return subject, html_body, f"This is a test email from Thravic at {sent_at}. Delivery is working."
