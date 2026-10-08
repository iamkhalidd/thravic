"""Payment routes — port of `routes/payments.ts` (Paystack).

Two things to be aware of when reading or testing this module:

* `POST /checkout` and `POST /verify` call the live Paystack API with the
  configured secret key. The parity specs deliberately only exercise the paths
  that reject the request *before* any outbound call.
* `upgrade_subscription` upserts with `INSERT ... ON CONFLICT (user_id)`, which
  requires a unique constraint on `subscriptions.user_id`. Production has it, but
  no migration created it, so a database built from migrations would raise "there
  is no unique or exclusion constraint matching the ON CONFLICT specification"
  and 500 every successful charge. `0006_subscriptions_constraints` closes that
  gap. See the note inside that function.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Request

from ..config import get_settings
from ..db import query, query_one, transaction
from ..errors import SimpleError
from ..js_compat import js_round
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.admin_auth import AdminUser, admin_auth
from ..middleware.auth import AuthUser, require_auth
from ..services import domain_service, plan_catalog, plan_service, recording_service
from ..services.email_service import send_payment_receipt_email

log = create_logger("Payments")

router = APIRouter()

PAYSTACK_BASE = "https://api.paystack.co"
PAYSTACK_TIMEOUT_SECONDS = 30.0

FREE_PLAN = "free"

FAKE_SUBSCRIPTION_FALLBACK = {"price": 0}

_background_tasks: set[asyncio.Task] = set()


def _fire_and_forget(coro) -> None:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


def _paystack_secret() -> str:
    """Read at request time, not import time, so env changes are picked up."""
    return get_settings().PAYSTACK_SECRET_KEY or ""


async def _plan_from_db(plan_id: str) -> dict[str, Any] | None:
    """The plan's price, if it can be bought: it exists and is active.

    A deactivated plan used to fall back to a hard-coded price and stay
    purchasable; now it can't be bought (its subscribers keep it).
    """
    plan = await plan_catalog.find(plan_id)
    if not plan or not plan.active:
        return None
    return {"id": plan.id, "price": plan.price, "currency": plan.currency}


async def _free_subscription_payload() -> dict[str, Any]:
    free = await plan_catalog.get(FREE_PLAN)
    return {
        "plan": "free",
        "status": "active",
        "eventsUsed": 0,
        "eventsLimit": free.events_limit,
        "domainsLimit": free.domains_limit,
        "features": list(free.features),
    }


def _paystack_mode(secret: str) -> str:
    if not secret:
        return "EMPTY"
    if secret.startswith("sk_live_"):
        return "live"
    if secret.startswith("sk_test_"):
        return "test"
    return "unknown"


@router.get("/status")
async def status(_admin: AdminUser = Depends(admin_auth)):
    """Diagnostic endpoint for admins. Reports the key's mode, never any of the key."""
    secret = _paystack_secret()
    frontend_url = get_settings().FRONTEND_URL or "NOT SET"
    server_url = get_settings().SERVER_URL or "NOT SET"

    return jsjson(
        {
            "paystackConfigured": bool(secret),
            "paystackMode": _paystack_mode(secret),
            "frontendUrl": frontend_url,
            "serverUrl": server_url,
            "callbackUrl": f"{frontend_url}/dashboard/settings?payment=success",
            "webhookUrl": f"{server_url}/api/payments/webhook",
        }
    )


@router.get("/plans")
async def plans():
    """Active plans as the pricing pages show them, bullets included."""
    everything = list((await plan_catalog.all_plans()).values())
    return jsjson(
        {
            "success": True,
            "plans": [plan_catalog.public(p, everything) for p in everything if p.active],
        }
    )


@router.get("/current")
async def current(user: AuthUser = Depends(require_auth)):
    try:
        if not get_settings().DATABASE_URL:
            return jsjson(
                {"success": True, "subscription": await _free_subscription_payload()}
            )

        subscription = await query_one(
            "SELECT * FROM subscriptions WHERE user_id = $1 "
            "ORDER BY created_at DESC LIMIT 1",
            user.user_id,
        )

        if not subscription:
            free = await plan_catalog.get(FREE_PLAN)
            await query(
                """
                INSERT INTO subscriptions (user_id, plan, events_limit, domains_limit)
                VALUES ($1, 'free', $2, $3)
                """,
                user.user_id,
                free.events_limit,
                free.domains_limit,
            )
            return jsjson(
                {"success": True, "subscription": await _free_subscription_payload()}
            )

        # The plan in force (a lapsed paid plan is free), with limits and features
        # from its current definition rather than values copied at purchase.
        plan = await plan_catalog.get((await plan_service.for_user(user.user_id)).name)
        period_end = subscription["current_period_end"]
        grace_ends = period_end + timedelta(days=plan_service.GRACE_DAYS) if period_end else None

        return jsjson(
            {
                "success": True,
                "subscription": {
                    "plan": plan.id,
                    "planName": plan.name,
                    "paidPlan": subscription["plan"],
                    "paidPlanName": (await plan_catalog.get(subscription["plan"])).name,
                    "status": subscription["status"],
                    "state": _billing_state(subscription["plan"], plan.id, period_end),
                    "graceEndsAt": grace_ends,
                    "eventsUsed": await plan_service.events_this_period(user.user_id),
                    "eventsLimit": plan.events_limit,
                    "domainsLimit": plan.domains_limit,
                    "teamLimit": plan.team_limit,
                    "recordingsPerDay": plan.recordings_per_day,
                    "currentPeriodEnd": subscription["current_period_end"],
                    "features": list(plan.features),
                },
            }
        )
    except Exception as exc:
        log.error(f"Error getting subscription: {exc}")
        raise SimpleError("Failed to get subscription", 500) from None


def _billing_state(paid_plan: str, plan: str, period_end: datetime | None) -> str:
    """free | active | grace (period over, access kept) | expired (back on free)."""
    if (paid_plan or FREE_PLAN) == FREE_PLAN:
        return "free"
    if plan == FREE_PLAN:
        return "expired"
    if period_end and period_end <= datetime.now(UTC):
        return "grace"
    return "active"


async def _validate_promo_code(code: str, plan: str, user_id: str) -> dict[str, Any]:
    promo = await query_one(
        "SELECT * FROM promo_codes WHERE code = $1 AND active = true FOR UPDATE",
        code.upper().strip(),
    )

    if not promo:
        return {"valid": False, "error": "Invalid or expired code"}

    now = datetime.now(UTC)

    starts_at = promo.get("starts_at")
    if starts_at and _as_aware(starts_at) > now:
        return {"valid": False, "error": "Invalid or expired code"}

    expires_at = promo.get("expires_at")
    if expires_at and _as_aware(expires_at) < now:
        return {"valid": False, "error": "Invalid or expired code"}

    if promo.get("max_uses") and (promo.get("used_count") or 0) >= promo["max_uses"]:
        return {"valid": False, "error": "Invalid or expired code"}

    applicable = promo.get("applicable_plans") or []
    if applicable and plan not in applicable:
        return {
            "valid": False,
            "error": "This code is not valid for the selected plan",
        }

    used_before = await query_one(
        "SELECT COUNT(*) as count FROM promo_redemptions "
        "WHERE promo_code_id = $1 AND user_id = $2",
        promo["id"],
        user_id,
    )
    # NOTE: `parseInt(row.count)` — the query does not cast to ::text, so asyncpg
    # hands back an int here rather than the string node-postgres would.
    if int((used_before or {}).get("count") or 0) >= (promo.get("max_per_user") or 0):
        return {"valid": False, "error": "You have already used this code"}

    return {"valid": True, "promo": promo}


def _as_aware(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    return datetime.now(UTC)


@router.post("/validate-promo")
async def validate_promo(request: Request, user: AuthUser = Depends(require_auth)):
    try:
        body = await _body(request)
        code = body.get("code")
        plan = body.get("plan")

        if not code or not plan:
            return jsjson(
                {"valid": False, "error": "Code and plan are required"}, status_code=400
            )

        result = await _validate_promo_code(code, plan, user.user_id)
        if not result["valid"]:
            return jsjson({"valid": False, "error": result["error"]})

        promo = result["promo"]
        db_plan = await _plan_from_db(plan)
        original_price = db_plan["price"] if db_plan else 0

        if promo["discount_type"] == "percentage":
            discounted = js_round(original_price * (1 - promo["discount_value"] / 100))
        else:
            discounted = max(0, original_price - promo["discount_value"])

        return jsjson(
            {
                "valid": True,
                "discount_type": promo["discount_type"],
                "discount_value": promo["discount_value"],
                "original_price": original_price,
                "discounted_price": discounted,
                "currency": (db_plan or {}).get("currency") or "NGN",
            }
        )
    except Exception as exc:
        log.error(f"Promo validation error: {exc}")
        raise SimpleError("Failed to validate code", 500) from None


@router.post("/checkout")
async def checkout(request: Request, user: AuthUser = Depends(require_auth)):
    try:
        secret = _paystack_secret()
        if not secret:
            log.warning("PAYSTACK_SECRET_KEY env var is empty or not set")
            return jsjson(
                {
                    "error": "Payment service not configured. PAYSTACK_SECRET_KEY is missing.",
                    "debug": {"envKeySet": bool(get_settings().PAYSTACK_SECRET_KEY)},
                },
                status_code=503,
            )

        body = await _body(request)
        plan = body.get("plan")
        promo_code = body.get("promoCode")
        user_email = user.email

        log.info(
            f"Checkout request: user={user.user_id}, email={user_email}, "
            f"plan={plan}, promo={promo_code or 'none'}"
        )

        db_plan = await _plan_from_db(plan) if plan else None
        original_price_units = db_plan["price"] if db_plan else 0
        currency = (db_plan or {}).get("currency") or "NGN"
        amount_kobo = original_price_units * 100

        if not amount_kobo:
            return jsjson(
                {"error": f"Price not configured for {plan} plan"}, status_code=400
            )

        promo_record: dict[str, Any] | None = None
        if promo_code:
            promo_result = await _validate_promo_code(promo_code, plan, user.user_id)
            if not promo_result["valid"]:
                return jsjson({"error": promo_result["error"]}, status_code=400)
            promo_record = promo_result["promo"]

            if promo_record["discount_type"] == "percentage":
                amount_kobo = js_round(
                    amount_kobo * (1 - promo_record["discount_value"] / 100)
                )
            else:
                amount_kobo = max(
                    100, amount_kobo - promo_record["discount_value"] * 100
                )
            log.info(
                f"Promo {promo_code} applied: original={original_price_units}, "
                f"discounted kobo={amount_kobo}"
            )

        frontend_url = get_settings().FRONTEND_URL or "http://localhost:3000"
        callback_url = f"{frontend_url}/dashboard/settings?payment=success"

        log.info(
            f"Paystack init: amount={amount_kobo}, currency={currency}, callback={callback_url}"
        )

        async with httpx.AsyncClient(timeout=PAYSTACK_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{PAYSTACK_BASE}/transaction/initialize",
                headers={
                    "Authorization": f"Bearer {secret}",
                    "Content-Type": "application/json",
                },
                json={
                    "email": user_email,
                    "amount": amount_kobo,
                    "currency": currency,
                    "callback_url": callback_url,
                    "metadata": {
                        "userId": user.user_id,
                        "plan": plan,
                        "promoCode": promo_code or None,
                        "promoId": (promo_record or {}).get("id"),
                        "cancel_action": f"{frontend_url}/dashboard/settings?payment=canceled",
                    },
                },
            )
            response.raise_for_status()
            payload = response.json()

        data = payload["data"]
        authorization_url = data["authorization_url"]
        reference = data["reference"]

        if promo_record:
            try:
                await query(
                    """
                    INSERT INTO promo_redemptions
                        (promo_code_id, user_id, plan, original_amount, discounted_amount,
                         paystack_ref)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    promo_record["id"],
                    user.user_id,
                    plan,
                    original_price_units * 100,
                    amount_kobo,
                    reference,
                )
                await query(
                    "UPDATE promo_codes SET used_count = used_count + 1 WHERE id = $1",
                    promo_record["id"],
                )
            except Exception as exc:
                log.warning(f"Failed to record promo redemption: {exc}")

        try:
            await query(
                """
                INSERT INTO payment_history
                    (user_id, plan, amount, currency, promo_code_id, paystack_ref, status)
                VALUES ($1, $2, $3, $4, $5, $6, 'pending')
                """,
                user.user_id,
                plan,
                amount_kobo,
                currency,
                (promo_record or {}).get("id"),
                reference,
            )
        except Exception as exc:
            log.warning(f"Failed to log payment history: {exc}")

        log.info(
            f"Paystack checkout initiated: user={user.user_id}, plan={plan}, ref={reference}"
        )
        return jsjson(
            {"success": True, "checkoutUrl": authorization_url, "reference": reference}
        )
    except Exception as exc:
        paystack_error, status_code = _paystack_error(exc)
        log.error(f"Paystack checkout FAILED [{status_code}]: {paystack_error or exc}")

        user_message = (
            (paystack_error or {}).get("message")
            or ((paystack_error or {}).get("data") or {}).get("message")
            or "Something went wrong. Please try again later."
        )

        return jsjson(
            {
                "error": user_message,
                "debug": {
                    "paystackStatus": status_code or None,
                    "paystackMessage": (paystack_error or {}).get("message"),
                },
            },
            status_code=500,
        )


def _paystack_error(exc: Exception) -> tuple[dict[str, Any] | None, int | None]:
    """Mirror axios's `error.response.data` / `error.response.status`."""
    response = getattr(exc, "response", None)
    if response is None:
        return None, None
    try:
        return response.json(), response.status_code
    except Exception:
        return None, response.status_code


@router.post("/verify")
async def verify(request: Request, user: AuthUser = Depends(require_auth)):
    try:
        secret = _paystack_secret()
        if not secret:
            log.warning("Paystack secret key not configured")
            return jsjson(
                {"error": "Payment service temporarily unavailable. Please try again later."},
                status_code=503,
            )

        body = await _body(request)
        reference = body.get("reference")
        if not reference:
            return jsjson({"error": "Reference is required"}, status_code=400)

        async with httpx.AsyncClient(timeout=PAYSTACK_TIMEOUT_SECONDS) as client:
            response = await client.get(
                f"{PAYSTACK_BASE}/transaction/verify/{_encode(reference)}",
                headers={"Authorization": f"Bearer {secret}"},
            )
            response.raise_for_status()
            payload = response.json()

        tx_data = payload["data"]
        if tx_data.get("status") != "success":
            return jsjson(
                {"error": "Payment not successful", "status": tx_data.get("status")},
                status_code=400,
            )

        metadata = tx_data.get("metadata") or {}
        user_id = metadata.get("userId")
        plan = metadata.get("plan")

        if user_id and plan and get_settings().DATABASE_URL:
            await _upgrade_subscription(
                user_id, plan, reference, tx_data.get("amount"), tx_data.get("currency")
            )

        return jsjson({"success": True, "plan": plan})
    except Exception as exc:
        log.error(f"Error verifying Paystack payment: {exc}")
        raise SimpleError(
            "Something went wrong. Please try again later.", 500
        ) from None


@router.post("/webhook")
async def webhook(request: Request):
    try:
        settings = get_settings()
        secret = settings.PAYSTACK_WEBHOOK_SECRET or _paystack_secret()
        if not secret:
            log.warning("Paystack webhook secret not configured")
            return jsjson({"error": "Service temporarily unavailable"}, status_code=503)

        body = await _body(request)
        signature = request.headers.get("x-paystack-signature") or ""

        # Express re-stringifies the parsed body, so the digest is computed over
        # the canonical compact form rather than the raw request bytes.
        canonical = json.dumps(body, separators=(",", ":"), ensure_ascii=False)
        digest = hmac.new(
            secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha512
        ).hexdigest()

        if not hmac.compare_digest(digest, signature):
            log.warning("Paystack webhook signature mismatch")
            return jsjson({"error": "Unauthorized"}, status_code=401)

        event_name = body.get("event")
        event_data = body.get("data") or {}
        log.info(f"Paystack webhook received: {event_name}")

        if event_name == "charge.success":
            metadata = event_data.get("metadata") or {}
            customer = event_data.get("customer") or {}
            user_id = metadata.get("userId")
            plan = metadata.get("plan")
            reference = event_data.get("reference")

            if user_id and plan and settings.DATABASE_URL:
                await _upgrade_subscription(
                    user_id, plan, reference, event_data.get("amount"), event_data.get("currency")
                )
                log.info(
                    f"User {user_id} upgraded to {plan} via webhook (ref: {reference})"
                )

            if user_id and customer.get("customer_code") and settings.DATABASE_URL:
                try:
                    await query(
                        "UPDATE users SET paystack_customer_code = $1 WHERE id = $2",
                        customer["customer_code"],
                        user_id,
                    )
                except Exception:
                    pass  # column may not exist yet - safe to skip

        else:
            log.debug(f"Unhandled Paystack event: {event_name}")

        return jsjson({"received": True})
    except Exception as exc:
        log.error(f"Paystack webhook error: {exc}")
        raise SimpleError("Internal error", 500) from None


def projected_limit_at(
    used: int, limit: int, start: datetime, resets_at: datetime, now: datetime
) -> datetime | None:
    """When, at the pace since `start`, the allowance runs out before it resets.

    None when it won't (or there's too little to go on: under an hour of data).
    """
    elapsed = (now - start).total_seconds()
    if used <= 0 or used >= limit or elapsed < 3600:
        return None
    runs_out = now + timedelta(seconds=(limit - used) * elapsed / used)
    return runs_out if runs_out < resets_at else None


@router.get("/usage")
async def usage(user: AuthUser = Depends(require_auth)):
    """Every allowance on the account: how much is used, the limit (None =
    unlimited), when it resets, and for events when it will run out at this pace.
    The flat event fields are kept for older clients."""
    try:
        if not get_settings().DATABASE_URL:
            return jsjson(
                {
                    "success": True,
                    "usage": {
                        "eventsThisMonth": 0,
                        "eventsLimit": (await plan_catalog.get(FREE_PLAN)).events_limit,
                        "percentUsed": 0,
                        "meters": [],
                    },
                }
            )

        now = datetime.now(UTC)
        # The plan the collector enforces (an inactive subscription is free).
        plan = await plan_service.for_user(user.user_id)
        start, resets_at = await plan_service.current_window(user.user_id, now)
        events_used = await plan_service.events_this_period(user.user_id, start)
        events_limit = plan.events_limit
        percent_used = (
            js_round((events_used / events_limit) * 100) if events_limit > 0 else 0
        )
        projected = projected_limit_at(events_used, events_limit, start, resets_at, now)
        tomorrow = datetime(now.year, now.month, now.day, tzinfo=UTC) + timedelta(days=1)

        meters: list[dict[str, Any]] = [
            {
                "key": "events",
                "label": "Events",
                "used": events_used,
                "limit": events_limit,
                "resetsAt": resets_at,
                "projectedLimitAt": projected,
            },
            {
                "key": "websites",
                "label": "Websites",
                "used": await domain_service.count_by_user(user.user_id),
                "limit": plan.domains_limit,
                "resetsAt": None,
            },
        ]
        if "team" in plan.features:
            meters.append(
                {
                    "key": "team",
                    "label": "Team members",
                    "used": len(await plan_service.team_member_ids(user.user_id)),
                    "limit": plan.team_limit,
                    "resetsAt": None,
                }
            )
        if "recordings" in plan.features:
            meters.append(
                {
                    "key": "recordings",
                    "label": "Recordings today",
                    "used": await recording_service.count_started_today_for_owner(user.user_id),
                    "limit": plan.recordings_per_day,
                    "resetsAt": tomorrow,
                }
            )

        return jsjson(
            {
                "success": True,
                "usage": {
                    "eventsThisMonth": events_used,
                    "eventsLimit": events_limit,
                    "percentUsed": percent_used,
                    "periodStart": start,
                    "resetsAt": resets_at,
                    "projectedLimitAt": projected,
                    "meters": meters,
                },
            }
        )
    except Exception as exc:
        log.error(f"Error getting usage: {exc}")
        raise SimpleError("Failed to get usage", 500) from None


async def _upgrade_subscription(
    user_id: str,
    plan: str,
    reference: str,
    amount: int | None = None,
    currency: str | None = None,
) -> None:
    """Apply a successful payment: start or extend the plan's period, email a receipt.

    Both `/verify` and the webhook report every payment, so the payment is first
    claimed in `payment_history` (unique on `paystack_ref`); a reference already
    applied changes nothing. `amount` is in kobo, as Paystack reports it.

    The new period comes from `plan_service.next_period`: renewals extend from
    the current end, a switch to another plan carries the unused days over.

    `ON CONFLICT (user_id)` relies on `subscriptions_user_id_unique` (0006).
    `plan` is written straight through: 0014 dropped the CHECK listing plan ids.
    """
    tier = await plan_catalog.find(plan)
    if not tier:
        # Paid for a plan that no longer exists: keep the payment visible.
        log.error(f"Payment for unknown plan {plan!r} by user {user_id} (ref {reference})")
        return

    # One transaction: a payment is marked applied only if the plan was granted.
    async with transaction() as conn:
        claimed = await conn.fetchrow(
            """
            INSERT INTO payment_history (user_id, plan, amount, currency, paystack_ref, status)
            VALUES ($1, $2, $3, $4, $5, 'success')
            ON CONFLICT (paystack_ref) DO UPDATE SET status = 'success'
                WHERE payment_history.status IS DISTINCT FROM 'success'
            RETURNING amount, currency
            """,
            user_id,
            tier.id,
            amount or 0,
            currency or tier.currency,
            reference,
        )
        if not claimed:
            log.info(f"Payment {reference} was already applied")
            return

        await conn.execute(
            "UPDATE users SET subscription = $1, paystack_subscription_code = $2 "
            "WHERE id = $3",
            tier.id,
            reference,
            user_id,
        )
        current = await conn.fetchrow(
            "SELECT plan, status, current_period_start, current_period_end "
            "FROM subscriptions WHERE user_id = $1 FOR UPDATE",
            user_id,
        )
        previous = await plan_catalog.find(current["plan"]) if current else None
        period_start, period_end = plan_service.next_period(
            dict(current) if current else None, tier, previous, datetime.now(UTC)
        )
        await conn.execute(
            """
            INSERT INTO subscriptions
                (user_id, paystack_subscription_code, plan, status, events_limit,
                 domains_limit, current_period_start, current_period_end)
            VALUES ($1, $2, $3, 'active', $4, $5, $6, $7)
            ON CONFLICT (user_id) DO UPDATE SET
                paystack_subscription_code = $2,
                plan                       = $3,
                status                     = 'active',
                events_limit               = $4,
                domains_limit              = $5,
                current_period_start       = $6,
                current_period_end         = $7,
                updated_at                 = NOW()
            """,
            user_id,
            reference,
            tier.id,
            tier.events_limit,
            tier.domains_limit,
            period_start,
            period_end,
        )

    try:
        account = await query_one(
            "SELECT email, name FROM users WHERE id = $1", user_id
        )
    except Exception:
        account = None

    if account:
        _fire_and_forget(
            send_payment_receipt_email(
                account["email"],
                account["name"],
                tier.name,
                (claimed["amount"] or 0) / 100,
                claimed["currency"] or tier.currency,
                reference,
                period_end,
            )
        )


async def _body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        body = {}
    return body if isinstance(body, dict) else {}


def _encode(value: str) -> str:
    from urllib.parse import quote

    # `encodeURIComponent` equivalent
    return quote(str(value), safe="")
