"""Revenue numbers for the admin panel, defined once.

MRR (monthly recurring revenue) here means: what the accounts that are paying
right now actually paid, as a monthly amount.

- The amount is the latest successful Paystack payment for the account's current
  plan, so a promo discount is already taken off. Plan list prices are not used.
- A yearly payment counts as one twelfth per month.
- Accounts in the grace days after their period ended are not counted; they are
  shown apart as "at risk" because they may not renew.
- Accounts on a paid plan with no payment behind it (an admin grant, or a 100%
  promo) are shown apart as "complimentary" and add nothing.

Amounts are in the currency's main unit (naira, dollars): Paystack reports kobo
and cents, so payment amounts are divided by 100.
"""

from __future__ import annotations

from zoneinfo import ZoneInfo

from ..config import get_settings
from ..db import query
from .plan_service import entitled


def report_zone() -> ZoneInfo:
    """The time zone "today" and daily charts are counted in (Lagos by default)."""
    try:
        return ZoneInfo(get_settings().REPORT_TIMEZONE or "Africa/Lagos")
    except Exception:  # noqa: BLE001 - a typo in the setting should not break the panel
        return ZoneInfo("Africa/Lagos")


def report_tz_name() -> str:
    return report_zone().key


# One row per paid, entitled subscription with how it is classified and its
# monthly amount. Shared by the MRR summary and the 12-month trend.
_CLASSIFIED = f"""
    SELECT s.user_id, s.plan, p.interval, s.current_period_end,
           COALESCE(pay.currency, p.currency, 'NGN') AS currency,
           CASE
               WHEN pay.amount IS NULL OR pay.amount = 0 OR s.current_period_end IS NULL
                   THEN 'complimentary'
               WHEN s.current_period_end <= NOW() THEN 'grace'
               ELSE 'paying'
           END AS kind,
           CASE WHEN p.interval = 'yearly' THEN COALESCE(pay.amount, 0) / 100.0 / 12
                ELSE COALESCE(pay.amount, 0) / 100.0
           END AS monthly
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan
    LEFT JOIN LATERAL (
        SELECT ph.amount, ph.currency
        FROM payment_history ph
        WHERE ph.user_id = s.user_id AND ph.plan = s.plan AND ph.status = 'success'
        ORDER BY ph.created_at DESC
        LIMIT 1
    ) pay ON TRUE
    WHERE {entitled('s')} AND s.plan <> 'free'
"""


async def mrr_summary() -> dict:
    """MRR with the accounts behind it, split the way the module docstring says.

    `mrr` is the main currency (NGN); `byCurrency` lists every currency seen, so a
    dollar plan is never silently added to naira.
    """
    rows = await query(
        f"""
        SELECT kind, currency, COUNT(*) AS accounts, COALESCE(SUM(monthly), 0) AS monthly
        FROM ({_CLASSIFIED}) c
        GROUP BY kind, currency
        """
    )
    summary: dict = {
        "mrr": 0.0,
        "paying": 0,
        "grace": 0,
        "graceMrr": 0.0,
        "complimentary": 0,
        "byCurrency": {},
    }
    for row in rows:
        kind, currency = row["kind"], row["currency"]
        accounts = int(row["accounts"] or 0)
        monthly = round(float(row["monthly"] or 0), 2)
        if kind == "complimentary":
            summary["complimentary"] += accounts
            continue
        if kind == "grace":
            summary["grace"] += accounts
            if currency == "NGN":
                summary["graceMrr"] = round(summary["graceMrr"] + monthly, 2)
            continue
        summary["paying"] += accounts
        summary["byCurrency"][currency] = round(summary["byCurrency"].get(currency, 0) + monthly, 2)
        if currency == "NGN":
            summary["mrr"] = round(summary["mrr"] + monthly, 2)
    return summary


async def plan_mix() -> list[dict]:
    """Accounts per plan by what they are entitled to now (not the users column).

    Accounts with no entitled paid plan count as free.
    """
    return await query(
        f"""
        SELECT COALESCE(s.plan, 'free') AS plan, COUNT(*) AS count
        FROM users u
        LEFT JOIN subscriptions s ON s.user_id = u.id AND {entitled('s')} AND s.plan <> 'free'
        GROUP BY COALESCE(s.plan, 'free')
        ORDER BY count DESC
        """
    )


async def monthly_revenue(months: int = 12) -> list[dict]:
    """Money actually received per calendar month (report time zone), last N months.

    This is cash in, not MRR: a yearly payment lands in the month it was paid.
    """
    tz = report_tz_name()
    return await query(
        """
        WITH months AS (
            SELECT generate_series(
                date_trunc('month', NOW() AT TIME ZONE $1) - ($2::int - 1) * INTERVAL '1 month',
                date_trunc('month', NOW() AT TIME ZONE $1),
                INTERVAL '1 month'
            ) AS month
        )
        SELECT to_char(m.month, 'YYYY-MM') AS month,
               COALESCE(SUM(ph.amount) FILTER (WHERE ph.currency = 'NGN'), 0) / 100.0 AS revenue,
               COUNT(ph.id) AS payments
        FROM months m
        LEFT JOIN payment_history ph
               ON ph.status = 'success'
              AND date_trunc('month', ph.created_at AT TIME ZONE $1) = m.month
        GROUP BY m.month
        ORDER BY m.month
        """,
        tz,
        months,
    )
