"""Revenue for the admin panel: MRR with what is behind it, and the monthly
check that Thravic's payment records agree with Paystack's.

The definitions live in `services/revenue_service.py`.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta

from fastapi import APIRouter, Request

from ...db import query
from ...errors import SimpleError
from ...json_response import jsjson
from ...logging import create_logger
from ...services import paystack_service, revenue_service

log = create_logger("Admin:Revenue")

router = APIRouter()

# Payments are recorded at checkout and paid moments later, so a payment near
# midnight on the last day can sit in different months on each side.
BOUNDARY_SLACK = timedelta(days=3)


@router.get("/summary")
async def summary():
    return jsjson(
        {
            "mrr": await revenue_service.mrr_summary(),
            "planMix": await revenue_service.plan_mix(),
            "monthly": await revenue_service.monthly_revenue(12),
            "timezone": revenue_service.report_tz_name(),
        }
    )


def _month_bounds(month: str) -> tuple[datetime, datetime]:
    if not re.fullmatch(r"\d{4}-\d{2}", month):
        raise SimpleError("Use a month like 2026-10", 400)
    year, mon = int(month[:4]), int(month[5:])
    if not 1 <= mon <= 12:
        raise SimpleError("Use a month like 2026-10", 400)
    zone = revenue_service.report_zone()
    start = datetime(year, mon, 1, tzinfo=zone)
    end = datetime(year + (mon == 12), mon % 12 + 1, 1, tzinfo=zone)
    return start, end


def _paid_at(tx: dict) -> datetime | None:
    raw = tx.get("paid_at") or tx.get("paidAt") or tx.get("created_at") or tx.get("createdAt")
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None


@router.get("/reconcile")
async def reconcile(request: Request):
    """Compare one month of successful payments, Paystack against Thravic.

    - matched: in both, same amount;
    - amountMismatch: in both, different amounts;
    - paystackOnly: Paystack took the money but Thravic has no successful record
      (the customer may not have their plan);
    - thravicOnly: Thravic shows a payment Paystack does not list as successful.
    """
    now = datetime.now(revenue_service.report_zone())
    month = request.query_params.get("month") or now.strftime("%Y-%m")
    start, end = _month_bounds(month)

    if not paystack_service.secret_key():
        raise SimpleError("PAYSTACK_SECRET_KEY is not set on the API", 503)
    try:
        paystack = await paystack_service.list_successful(
            start - BOUNDARY_SLACK, end + BOUNDARY_SLACK
        )
    except Exception as exc:  # noqa: BLE001
        log.error(f"Paystack transaction list failed: {exc}")
        raise SimpleError("Paystack could not be reached. Try again in a minute.", 502) from None

    paystack_refs = {str(tx.get("reference")) for tx in paystack if tx.get("reference")}
    in_month = [tx for tx in paystack if (paid := _paid_at(tx)) and start <= paid < end]

    ours = await query(
        """
        SELECT ph.paystack_ref, ph.status, ph.amount, ph.currency, ph.plan, ph.created_at,
               u.email
        FROM payment_history ph
        LEFT JOIN users u ON u.id = ph.user_id
        WHERE ph.paystack_ref = ANY($1::text[])
           OR (ph.status = 'success' AND ph.created_at >= $2 AND ph.created_at < $3)
        """,
        list(paystack_refs), start, end,
    )
    by_ref = {row["paystack_ref"]: row for row in ours}

    matched: list[dict] = []
    mismatch: list[dict] = []
    paystack_only: list[dict] = []
    for tx in in_month:
        ref = str(tx.get("reference"))
        customer = tx.get("customer") or {}
        item = {
            "reference": ref,
            "paystackAmount": (tx.get("amount") or 0) / 100,
            "currency": tx.get("currency"),
            "paidAt": str(_paid_at(tx)),
            "email": customer.get("email"),
        }
        row = by_ref.get(ref)
        if not row or row["status"] != "success":
            paystack_only.append({**item, "thravicStatus": row["status"] if row else None})
        elif int(row["amount"] or 0) != int(tx.get("amount") or 0):
            mismatch.append({**item, "thravicAmount": int(row["amount"] or 0) / 100})
        else:
            matched.append(item)

    thravic_only = [
        {
            "reference": row["paystack_ref"],
            "thravicAmount": int(row["amount"] or 0) / 100,
            "currency": row["currency"],
            "plan": row["plan"],
            "email": row["email"],
            "createdAt": row["created_at"],
        }
        for row in ours
        if row["status"] == "success"
        and start <= row["created_at"] < end
        and row["paystack_ref"] not in paystack_refs
    ]

    def total(items: list[dict], key: str) -> float:
        naira = [i for i in items if (i.get("currency") or "NGN") == "NGN"]
        return round(sum(i.get(key) or 0 for i in naira), 2)

    return jsjson(
        {
            "month": month,
            "timezone": revenue_service.report_tz_name(),
            "paystackTotal": total(matched + mismatch + paystack_only, "paystackAmount"),
            "thravicTotal": round(
                sum(int(r["amount"] or 0) / 100 for r in ours
                    if r["status"] == "success" and start <= r["created_at"] < end
                    and (r["currency"] or "NGN") == "NGN"),
                2,
            ),
            "matched": len(matched),
            "amountMismatch": mismatch,
            "paystackOnly": paystack_only,
            "thravicOnly": thravic_only,
        }
    )
