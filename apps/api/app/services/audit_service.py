"""Admin audit log — port of `services/auditService.ts`.

Every admin mutation funnels through `log_action`. Two behaviours are
deliberate and preserved:

* Failures are **swallowed**. The Express version awaits this inside a
  try/catch that only logs, so an audit write can never fail the operation it
  is recording.
* Once the web layer is switched over, that swallowing quietly masks a real
  defect: `admin_audit_log.target_id` is a **UUID** column while `plans` is
  keyed by **VARCHAR** ids, so `plan.create` / `plan.update` pass a value like
  `"new_plan"` and the insert raises `invalid input syntax for type uuid`.
  Those two actions are therefore missing from the audit trail in production.
  Reproduced as-is rather than "fixed", because changing it would alter
  behaviour the Express service does not have.
"""

from __future__ import annotations

from typing import Any

from ..db import query, query_one
from ..logging import create_logger

log = create_logger("Audit")


async def log_action(
    *,
    admin_id: str | None,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    """Insert an audit row; never raises."""
    try:
        await query(
            """
            INSERT INTO admin_audit_log
                (admin_id, action, target_type, target_id, details, ip_address)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            admin_id,
            action,
            target_type or None,
            target_id or None,
            # Passed as a Python object: the asyncpg jsonb codec serialises it,
            # so pre-dumping to a string here would double-encode it.
            details if details else None,
            ip_address or None,
        )
    except Exception as exc:  # noqa: BLE001 — mirrors the TS catch-all
        log.error(f"Failed to log action: {exc}")


async def get_audit_log(
    *,
    admin_id: str | None = None,
    action: str | None = None,
    target_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    """Return one page of audit entries plus the unpaginated total."""
    conditions: list[str] = []
    params: list[Any] = []
    index = 1

    if admin_id:
        conditions.append(f"al.admin_id = ${index}")
        params.append(admin_id)
        index += 1
    if action:
        conditions.append(f"al.action LIKE ${index}")
        params.append(f"%{action}%")
        index += 1
    if target_type:
        conditions.append(f"al.target_type = ${index}")
        params.append(target_type)
        index += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    # `options.limit || 50` in TS: a NaN or 0 limit falls back to 50.
    limit = limit or 50
    offset = offset or 0

    entries = await query(
        f"""
        SELECT al.*, u.name as admin_name, u.email as admin_email
        FROM admin_audit_log al
        LEFT JOIN users u ON al.admin_id = u.id
        {where}
        ORDER BY al.created_at DESC
        LIMIT ${index} OFFSET ${index + 1}
        """,
        *params,
        limit,
        offset,
    )

    count_row = await query_one(
        f"SELECT COUNT(*) as count FROM admin_audit_log al {where}", *params
    )

    return {
        "entries": entries,
        "total": int((count_row or {}).get("count") or 0),
        "limit": limit,
        "offset": offset,
    }
