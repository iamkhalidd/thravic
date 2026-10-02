"""Payment routes — port of `routes/payments.ts` (Paystack).

Two things to be aware of when reading or testing this module:

* `POST /checkout` and `POST /verify` call the live Paystack API with the
  configured secret key. The parity specs deliberately only exercise the paths
  that reject the request *before* any outbound call.
* `upgrade_subscription` reproduces a genuine defect. Its
  `INSERT ... ON CONFLICT (user_id)` requires a unique constraint on
  `subscriptions.user_id`, and the schema has none (only a primary key on `id`),
  so the statement always raises. See the note inside that function.
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
from ..db import query, query_one
from ..errors import SimpleError
from ..js_compat import js_round
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.auth import AuthUser, require_auth
from ..plans import PLAN_FEATURES, PLAN_LIMITS
from ..services.email_service import send_payment_receipt_email

log = create_logger("Payments")

router = APIRouter()

PAYSTACK_BASE = "https://api.paystack.co"
PAYSTACK_TIMEOUT_SECONDS = 30.0

FREE_PLAN = "free"

# Used only if the `plans` table has no row for the requested plan
FALLBACK_PRICES: dict[str, dict[str, Any]] = {
    "pro": {"price": 45_000_00, "currency": "NGN"},
    "agency": {"price": 125_000_00, "currency": "NGN"},
}

# Display prices used by the receipt email, in USD
RECEIPT_PLAN_PRICES: dict[str, float] = {"pro": 29, "agency": 79}

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
    try:
        return await query_one(
            "SELECT * FROM plans WHERE id = $1 AND active = true", plan_id
        )
    except Exception:
        return None  # the plans table may not exist yet


def _free_subscription_payload() -> dict[str, Any]:
    tier = PLAN_LIMITS[FREE_PLAN]
    return {
        "plan": "free",
        "status": "active",
        "eventsUsed": 0,
        "eventsLimit": tier["eventsLimit"],
        "domainsLimit": tier["domainsLimit"],
        "features": PLAN_FEATURES[FREE_PLAN],
    }


@router.get("/status")
async def status():
    """Diagnostic endpoint. Deliberately does not require auth."""
    secret = _paystack_secret()
    frontend_url = get_settings().FRONTEND_URL or "NOT SET"
    server_url = get_settings().SERVER_URL or "NOT SET"

    return jsjson(
        {
            "paystackConfigured": bool(secret),
            # NOTE: this exposes the first 8 characters of the live secret key.
            "paystackKeyPrefix": f"{secret[:8]}..." if secret else "EMPTY",
            "frontendUrl": frontend_url,
            "serverUrl": server_url,
            "callbackUrl": f"{frontend_url}/dashboard/settings?payment=success",
            "webhookUrl": f"{server_url}/api/payments/webhook",
        }
    )


@router.get("/plans")
async def plans():
    try:
        db_plans = await query(
            "SELECT * FROM plans WHERE active = true ORDER BY sort_order ASC"
        )
        if db_plans:
            return jsjson({"success": True, "plans": db_plans})
    except Exception:
        pass  # fall through to the config-based plans

    fallback = [
        {"id": key, **tier, "features": PLAN_FEATURES.get(key, [])}
        for key, tier in PLAN_LIMITS.items()
    ]
    return jsjson({"success": True, "plans": fallback})


@router.get("/current")
async def current(user: AuthUser = Depends(require_auth)):
    try:
        if not get_settings().DATABASE_URL:
            return jsjson(
                {"success": True, "subscription": _free_subscription_payload()}
            )

        subscription = await query_one(
            "SELECT * FROM subscriptions WHERE user_id = $1 "
            "ORDER BY created_at DESC LIMIT 1",
            user.user_id,
        )

        if not subscription:
            tier = PLAN_LIMITS[FREE_PLAN]
            await query(
                """
                INSERT INTO subscriptions (user_id, plan, events_limit, domains_limit)
                VALUES ($1, 'free', $2, $3)
                """,
                user.user_id,
                tier["eventsLimit"],
                tier["domainsLimit"],
            )
            return jsjson(
                {"success": True, "subscription": _free_subscription_payload()}
            )

        plan_key = str(subscription.get("plan") or "").lower().strip()

        return jsjson(
            {
                "success": True,
                "subscription": {
                    "plan": subscription["plan"],
                    "status": subscription["status"],
                    "eventsUsed": subscription["events_used"],
                    "eventsLimit": subscription["events_limit"],
                    "domainsLimit": subscription["domains_limit"],
                    "currentPeriodEnd": subscription["current_period_end"],
                    "features": PLAN_FEATURES.get(plan_key) or PLAN_FEATURES[FREE_PLAN],
                },
            }
        )
    except Exception as exc:
        log.error(f"Error getting subscription: {exc}")
        raise SimpleError("Failed to get subscription", 500) from None


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
        original_price = (
            db_plan["price"]
            if db_plan
            else (FALLBACK_PRICES.get(plan, {}).get("price") or 0) / 100
        )

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
        fallback = FALLBACK_PRICES.get(plan) if plan else None
        original_price_units = (
            db_plan["price"] if db_plan else (fallback or {}).get("price", 0) / 100
        )
        currency = (db_plan or {}).get("currency") or (fallback or {}).get(
            "currency", "NGN"
        )
        amount_kobo = (db_plan["price"] * 100) if db_plan else (fallback or {}).get("price")

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
            await _upgrade_subscription(user_id, plan, reference)

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
                await _upgrade_subscription(user_id, plan, reference)
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

        elif event_name == "subscription.disable":
            subscription_code = event_data.get("subscription_code")
            if subscription_code and settings.DATABASE_URL:
                free_tier = PLAN_LIMITS[FREE_PLAN]
                await query(
                    """
                    UPDATE subscriptions
                    SET plan = 'free', status = 'canceled',
                        events_limit = $1, domains_limit = $2, updated_at = NOW()
                    WHERE paystack_subscription_code = $3
                    """,
                    free_tier["eventsLimit"],
                    free_tier["domainsLimit"],
                    subscription_code,
                )
                log.info(f"Subscription {subscription_code} disabled - downgraded to free")

        else:
            log.debug(f"Unhandled Paystack event: {event_name}")

        return jsjson({"received": True})
    except Exception as exc:
        log.error(f"Paystack webhook error: {exc}")
        raise SimpleError("Internal error", 500) from None


@router.get("/usage")
async def usage(user: AuthUser = Depends(require_auth)):
    try:
        if not get_settings().DATABASE_URL:
            return jsjson(
                {
                    "success": True,
                    "usage": {
                        "eventsThisMonth": 0,
                        "eventsLimit": PLAN_LIMITS[FREE_PLAN]["eventsLimit"],
                        "percentUsed": 0,
                    },
                }
            )

        domains = await query(
            "SELECT id FROM domains WHERE user_id = $1", user.user_id
        )

        if not domains:
            return jsjson(
                {
                    "success": True,
                    "usage": {
                        "eventsThisMonth": 0,
                        "eventsLimit": PLAN_LIMITS[FREE_PLAN]["eventsLimit"],
                        "percentUsed": 0,
                    },
                }
            )

        domain_ids = [d["id"] for d in domains]
        now = datetime.now(UTC)
        month_start = datetime(now.year, now.month, 1, tzinfo=UTC)

        usage_row = await query_one(
            """
            SELECT COALESCE(SUM(events_count), 0) as total
            FROM usage_logs
            WHERE domain_id = ANY($1) AND month >= $2
            """,
            domain_ids,
            month_start,
        )

        events_used = int((usage_row or {}).get("total") or 0)
        subscription = await query_one(
            "SELECT events_limit FROM subscriptions WHERE user_id = $1", user.user_id
        )

        events_limit = (
            subscription["events_limit"]
            if subscription
            else PLAN_LIMITS[FREE_PLAN]["eventsLimit"]
        )
        percent_used = (
            js_round((events_used / events_limit) * 100) if events_limit > 0 else 0
        )

        return jsjson(
            {
                "success": True,
                "usage": {
                    "eventsThisMonth": events_used,
                    "eventsLimit": events_limit,
                    "percentUsed": percent_used,
                },
            }
        )
    except Exception as exc:
        log.error(f"Error getting usage: {exc}")
        raise SimpleError("Failed to get usage", 500) from None


async def _upgrade_subscription(user_id: str, plan: str, reference: str) -> None:
    """Upsert the subscription and email a receipt.

    ⚠️ `ON CONFLICT (user_id)` REQUIRES a unique constraint on
    `subscriptions.user_id`. The schema only has a primary key on `id`, so this
    statement raises `there is no unique or exclusion constraint matching the
    ON CONFLICT specification`. The exception propagates, which means the caller
    returns 500, the receipt email is never sent, and the `subscriptions` row is
    never upgraded — a paying customer gets no features. Reproduced faithfully
    here; fixing it is a schema decision.
    """
    tier = PLAN_LIMITS.get(plan)
    if not tier:
        return

    period_end = datetime.now(UTC) + timedelta(days=30)

    try:
        await query(
            "UPDATE users SET subscription = $1, paystack_subscription_code = $2 "
            "WHERE id = $3",
            plan,
            reference,
            user_id,
        )
    except Exception:
        pass  # ignore if the column is missing

    await query(
        """
        INSERT INTO subscriptions
            (user_id, paystack_subscription_code, plan, status, events_limit, domains_limit,
             current_period_end)
        VALUES ($1, $2, $3, 'active', $4, $5, $6)
        ON CONFLICT (user_id) DO UPDATE SET
            paystack_subscription_code = $2,
            plan                       = $3,
            status                     = 'active',
            events_limit               = $4,
            domains_limit              = $5,
            current_period_end         = $6,
            updated_at                 = NOW()
        """,
        user_id,
        reference,
        plan,
        tier["eventsLimit"],
        tier["domainsLimit"],
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
                plan,
                RECEIPT_PLAN_PRICES.get(plan, 0),
                reference,
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
