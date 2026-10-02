"""Admin domain management — port of `routes/admin/domains.ts` (5 handlers)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request

from ...db import query, query_one
from ...errors import SimpleError
from ...js_compat import js_parse_int_or_nan
from ...json_response import jsjson
from ...logging import create_logger
from ...middleware.admin_auth import AdminUser, admin_auth
from ...services.audit_service import log_action
from ...validators.admin import transfer_domain_schema, update_admin_domain_schema
from ._util import client_ip

log = create_logger("Admin:Domains")

router = APIRouter()


def _count(row: dict | None) -> int:
    return int((row or {}).get("count") or 0)


@router.get("")
@router.get("/")
async def list_domains(request: Request):
    try:
        params = request.query_params
        search = params.get("search") or ""
        limit = min(js_parse_int_or_nan(params.get("limit") or "25"), 100)
        offset = js_parse_int_or_nan(params.get("offset") or "0")

        conditions: list[str] = []
        args: list[Any] = []
        index = 1

        if search:
            conditions.append(
                f"(d.domain ILIKE ${index} OR d.name ILIKE ${index} OR u.email ILIKE ${index})"
            )
            args.append(f"%{search}%")
            index += 1

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        domains = await query(
            f"""
            SELECT d.*, u.email as owner_email, u.name as owner_name,
                   COUNT(DISTINCT e.id) as events_30d,
                   COUNT(DISTINCT dm.id) as members_count
            FROM domains d
            LEFT JOIN users u ON d.user_id = u.id
            LEFT JOIN events e ON e.domain_id = d.id AND e.created_at >= NOW() - INTERVAL '30 days'
            LEFT JOIN domain_members dm ON dm.domain_id = d.id
            {where}
            GROUP BY d.id, u.email, u.name
            ORDER BY d.created_at DESC
            LIMIT ${index} OFFSET ${index + 1}
            """,
            *args,
            limit,
            offset,
        )

        count_row = await query_one(
            f"""
            SELECT COUNT(*) as count FROM domains d
            LEFT JOIN users u ON d.user_id = u.id
            {where}
            """,
            *args,
        )

        return jsjson(
            {
                "domains": domains,
                "total": _count(count_row),
                "limit": limit,
                "offset": offset,
            }
        )
    except Exception as exc:  # noqa: BLE001
        log.error(f"Domains list error: {exc}")
        raise SimpleError("Failed to load domains", 500) from None


@router.get("/{domain_id}")
async def domain_detail(domain_id: str):
    try:
        domain = await query_one(
            """
            SELECT d.*, u.email as owner_email, u.name as owner_name
            FROM domains d LEFT JOIN users u ON d.user_id = u.id
            WHERE d.id = $1
            """,
            domain_id,
        )

        if not domain:
            raise SimpleError("Domain not found", 404)

        members = await query(
            """
            SELECT u.id, u.name, u.email, dm.role, dm.created_at
            FROM domain_members dm JOIN users u ON dm.user_id = u.id
            WHERE dm.domain_id = $1
            """,
            domain_id,
        )

        funnels = await query(
            "SELECT id, name, created_at FROM funnels WHERE domain_id = $1",
            domain_id,
        )

        webhooks = await query(
            "SELECT id, url, events, enabled FROM webhooks WHERE domain_id = $1",
            domain_id,
        )

        return jsjson(
            {
                "domain": domain,
                "members": members,
                "funnels": funnels,
                "webhooks": webhooks,
            }
        )
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Domain detail error: {exc}")
        raise SimpleError("Failed to load domain", 500) from None


@router.patch("/{domain_id}")
async def update_domain(
    domain_id: str, request: Request, admin: AdminUser = Depends(admin_auth)
):
    try:
        body = await _json_body(request)
        data, issues = update_admin_domain_schema(body)
        if issues:
            raise SimpleError(issues[0]["message"], 400)

        updates: list[str] = []
        args: list[Any] = []
        index = 1

        # `!== undefined`, so `verified: false` is an update — truthiness would
        # skip it and silently ignore the un-verification.
        if "name" in data:
            updates.append(f"name = ${index}")
            args.append(data["name"])
            index += 1
        if "verified" in data:
            updates.append(f"verified = ${index}")
            args.append(data["verified"])
            index += 1

        if not updates:
            raise SimpleError("No fields to update", 400)

        args.append(domain_id)
        domain = await query_one(
            f"UPDATE domains SET {', '.join(updates)} WHERE id = ${index} RETURNING *",
            *args,
        )

        await log_action(
            admin_id=admin.user_id,
            action="domain.update",
            target_type="domain",
            target_id=domain_id,
            details=data,
            ip_address=client_ip(request),
        )

        return jsjson(domain)
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Domain update error: {exc}")
        raise SimpleError("Failed to update domain", 500) from None


@router.post("/{domain_id}/transfer")
async def transfer_domain(
    domain_id: str, request: Request, admin: AdminUser = Depends(admin_auth)
):
    try:
        body = await _json_body(request)
        data, issues = transfer_domain_schema(body)
        if issues:
            raise SimpleError(issues[0]["message"], 400)

        new_user_id = data["newUserId"]

        new_owner = await query_one("SELECT id FROM users WHERE id = $1", new_user_id)
        if not new_owner:
            raise SimpleError("Target user not found", 404)

        await query(
            "UPDATE domains SET user_id = $1 WHERE id = $2", new_user_id, domain_id
        )

        await log_action(
            admin_id=admin.user_id,
            action="domain.transfer",
            target_type="domain",
            target_id=domain_id,
            details={"newUserId": new_user_id},
            ip_address=client_ip(request),
        )

        return jsjson({"message": "Domain transferred successfully"})
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Domain transfer error: {exc}")
        raise SimpleError("Failed to transfer domain", 500) from None


@router.delete("/{domain_id}")
async def delete_domain(
    domain_id: str, request: Request, admin: AdminUser = Depends(admin_auth)
):
    try:
        domain = await query_one(
            "SELECT domain FROM domains WHERE id = $1", domain_id
        )
        if not domain:
            raise SimpleError("Domain not found", 404)

        await query("DELETE FROM domains WHERE id = $1", domain_id)

        await log_action(
            admin_id=admin.user_id,
            action="domain.delete",
            target_type="domain",
            target_id=domain_id,
            details={"domain": domain["domain"]},
            ip_address=client_ip(request),
        )

        return jsjson({"message": "Domain deleted"})
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Domain delete error: {exc}")
        raise SimpleError("Failed to delete domain", 500) from None


async def _json_body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}
