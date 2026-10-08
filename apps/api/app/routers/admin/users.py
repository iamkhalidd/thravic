"""Admin user management — port of `routes/admin/users.ts` (8 handlers).

Two behaviours are inherited from the Express source and preserved on purpose:

* `PATCH /:id` syncs the `subscriptions` row with an
  `ON CONFLICT (user_id) DO UPDATE`, but `subscriptions` has **no unique
  constraint on `user_id`** — only its primary key. Postgres therefore rejects the
  statement, the handler's catch turns it into a 500, and because the earlier
  `UPDATE users` already committed, the name/email change sticks while the plan
  change does not. So changing a user's plan from the admin UI currently always
  fails with "Failed to update user".
* `DELETE /:id` and `POST /:id/impersonate` require `super_admin`.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Depends, Request

from ...db import query, query_one
from ...errors import SimpleError
from ...js_compat import js_parse_int_or_nan
from ...json_response import jsjson
from ...logging import create_logger
from ...middleware.admin_auth import AdminUser, admin_auth, super_admin_auth
from ...security import get_jwt_secret
from ...services import plan_catalog
from ...services.audit_service import log_action
from ...services.email_service import (
    send_account_reactivated_email,
    send_account_suspended_email,
    send_email,
)
from ...validators.admin import admin_reset_password_schema, update_user_schema
from ..auth import hash_password
from ._util import client_ip, empty_json_response, fire_and_forget

log = create_logger("Admin:Users")

router = APIRouter()

VALID_SORTS = ("created_at", "name", "email", "subscription")

IMPERSONATION_SECONDS = 900


def _count(row: dict | None) -> int:
    return int((row or {}).get("count") or 0)


@router.get("")
@router.get("/")
async def list_users(request: Request):
    try:
        params = request.query_params
        search = params.get("search") or ""
        plan = params.get("plan") or ""
        role = params.get("role") or ""
        sort = params.get("sort") or "created_at"
        order = "ASC" if params.get("order") == "asc" else "DESC"
        # No fallback around parseInt, so `?limit=abc` becomes NaN -> SQL error -> 500.
        limit = min(js_parse_int_or_nan(params.get("limit") or "25"), 100)
        offset = js_parse_int_or_nan(params.get("offset") or "0")

        conditions: list[str] = []
        args: list = []
        index = 1

        if search:
            conditions.append(f"(u.name ILIKE ${index} OR u.email ILIKE ${index})")
            args.append(f"%{search}%")
            index += 1
        if plan:
            conditions.append(f"u.subscription = ${index}")
            args.append(plan)
            index += 1
        if role:
            conditions.append(f"u.role = ${index}")
            args.append(role)
            index += 1

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        sort_column = sort if sort in VALID_SORTS else "created_at"

        users = await query(
            f"""
            SELECT u.id, u.name, u.email, u.subscription, u.role, u.created_at,
                   COUNT(DISTINCT d.id) as domains_count,
                   -- Counted from `events`: nothing writes `usage_logs`. Runs for
                   -- one page of users, served by the (domain_id, created_at) index.
                   (SELECT COUNT(*) FROM events e
                    JOIN domains ud ON ud.id = e.domain_id
                    WHERE ud.user_id = u.id) as total_events
            FROM users u
            LEFT JOIN domains d ON d.user_id = u.id
            {where}
            GROUP BY u.id
            ORDER BY u.{sort_column} {order}
            LIMIT ${index} OFFSET ${index + 1}
            """,
            *args,
            limit,
            offset,
        )

        count_row = await query_one(
            f"SELECT COUNT(*) as count FROM users u {where}", *args
        )

        return jsjson(
            {
                "users": users,
                "total": _count(count_row),
                "limit": limit,
                "offset": offset,
            }
        )
    except Exception as exc:  # noqa: BLE001
        log.error(f"Users list error: {exc}")
        raise SimpleError("Failed to load users", 500) from None


@router.get("/{user_id}")
async def user_detail(user_id: str):
    try:
        user = await query_one(
            """
            SELECT id, name, email, subscription, role, paystack_customer_code,
                   preferences, created_at, updated_at
            FROM users WHERE id = $1
            """,
            user_id,
        )

        if not user:
            raise SimpleError("User not found", 404)

        domains = await query(
            """
            SELECT d.*, COUNT(e.id) as events_count
            FROM domains d
            LEFT JOIN events e ON e.domain_id = d.id AND e.created_at >= NOW() - INTERVAL '30 days'
            WHERE d.user_id = $1
            GROUP BY d.id
            ORDER BY d.created_at DESC
            """,
            user_id,
        )

        subscription = await query_one(
            "SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
            user_id,
        )

        return jsjson({"user": user, "domains": domains, "subscription": subscription})
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"User detail error: {exc}")
        raise SimpleError("Failed to load user", 500) from None


@router.patch("/{user_id}")
async def update_user(
    user_id: str, request: Request, admin: AdminUser = Depends(admin_auth)
):
    try:
        body = await _json_body(request)
        data, issues = update_user_schema(body)
        if issues:
            raise SimpleError(issues[0]["message"], 400)
        if "subscription" in data and not await plan_catalog.find(data["subscription"]):
            raise SimpleError(f'Unknown plan "{data["subscription"]}"', 400)

        updates: list[str] = []
        args: list = []
        index = 1

        for field in ("name", "email", "subscription", "role"):
            if field in data:
                updates.append(f"{field} = ${index}")
                args.append(data[field])
                index += 1

        if not updates:
            raise SimpleError("No fields to update", 400)

        updates.append("updated_at = NOW()")
        args.append(user_id)

        user = await query_one(
            f"""
            UPDATE users SET {', '.join(updates)}
            WHERE id = ${index}
            RETURNING id, name, email, subscription, role
            """,
            *args,
        )

        subscription = data.get("subscription")

        # Deliberately NOT wrapped in a transaction, and deliberately allowed to
        # fail: `subscriptions` has no unique constraint on `user_id`, so this
        # statement always errors and the handler answers 500. See the module
        # docstring — the user row above is already committed by then.
        if subscription and user:
            limits = await plan_catalog.get(subscription)
            await query(
                """
                INSERT INTO subscriptions (user_id, plan, status, events_limit, domains_limit)
                VALUES ($1, $2, 'active', $3, $4)
                ON CONFLICT (user_id) DO UPDATE
                  SET plan = $2, events_limit = $3, domains_limit = $4,
                      updated_at = NOW(), events_used = subscriptions.events_used
                """,
                user_id,
                subscription,
                limits.events_limit,
                limits.domains_limit,
            )

        await log_action(
            admin_id=admin.user_id,
            action="user.update",
            target_type="user",
            target_id=user_id,
            details={"updates": data},
            ip_address=client_ip(request),
        )

        # `res.json(undefined)` when the UPDATE matched no row.
        if user is None:
            return empty_json_response()

        return jsjson(user)
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"User update error: {exc}")
        raise SimpleError("Failed to update user", 500) from None


@router.post("/{user_id}/suspend")
async def toggle_suspend(
    user_id: str, request: Request, admin: AdminUser = Depends(admin_auth)
):
    try:
        user = await query_one(
            "SELECT role, email, name FROM users WHERE id = $1", user_id
        )
        if not user:
            raise SimpleError("User not found", 404)

        # The toggle flips between "suspended" and "user", so suspending an admin
        # and then reactivating them would silently demote them.
        if user.get("role") not in ("user", "suspended"):
            raise SimpleError("Change this admin's role to user before suspending them", 400)

        new_role = "user" if user.get("role") == "suspended" else "suspended"

        await query(
            "UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2",
            new_role,
            user_id,
        )

        await log_action(
            admin_id=admin.user_id,
            action="user.suspend" if new_role == "suspended" else "user.activate",
            target_type="user",
            target_id=user_id,
            ip_address=client_ip(request),
        )

        # Non-blocking, like the un-awaited `.catch()` in Express.
        if new_role == "suspended":
            fire_and_forget(send_account_suspended_email(user["email"], user["name"]))
        else:
            fire_and_forget(send_account_reactivated_email(user["email"], user["name"]))

        label = "suspended" if new_role == "suspended" else "activated"
        return jsjson({"message": f"User {label}"})
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"User suspend error: {exc}")
        raise SimpleError("Failed to toggle user status", 500) from None


@router.post("/{user_id}/email")
async def send_direct_email(
    user_id: str, request: Request, admin: AdminUser = Depends(admin_auth)
):
    try:
        body = await _json_body(request)
        subject = body.get("subject")
        message = body.get("message")

        # Truthiness, not presence: an empty string is rejected too.
        if not subject or not message:
            raise SimpleError("Subject and message are required", 400)

        user = await query_one(
            "SELECT email, name FROM users WHERE id = $1", user_id
        )
        if not user:
            raise SimpleError("User not found", 404)

        await send_email(
            user["email"],
            subject,
            message.replace("\n", "<br>"),
            message,
        )

        await log_action(
            admin_id=admin.user_id,
            action="user.email_sent",
            target_type="user",
            target_id=user_id,
            details={"subject": subject},
            ip_address=client_ip(request),
        )

        return jsjson({"message": "Email sent successfully"})
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Direct email error: {exc}")
        raise SimpleError("Failed to send direct email", 500) from None


@router.post("/{user_id}/reset-password")
async def reset_password(
    user_id: str, request: Request, admin: AdminUser = Depends(admin_auth)
):
    try:
        body = await _json_body(request)
        data, issues = admin_reset_password_schema(body)
        if issues:
            raise SimpleError(issues[0]["message"], 400)

        hashed = hash_password(data["newPassword"])
        await query(
            "UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2",
            hashed,
            user_id,
        )

        await log_action(
            admin_id=admin.user_id,
            action="user.reset_password",
            target_type="user",
            target_id=user_id,
            ip_address=client_ip(request),
        )

        return jsjson({"message": "Password reset successfully"})
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Password reset error: {exc}")
        raise SimpleError("Failed to reset password", 500) from None


@router.delete("/{user_id}")
async def delete_user(
    user_id: str, request: Request, admin: AdminUser = Depends(super_admin_auth)
):
    try:
        user = await query_one("SELECT id, email FROM users WHERE id = $1", user_id)
        if not user:
            raise SimpleError("User not found", 404)

        # Related rows go with it through the FK constraints.
        await query("DELETE FROM users WHERE id = $1", user_id)

        await log_action(
            admin_id=admin.user_id,
            action="user.delete",
            target_type="user",
            target_id=user_id,
            details={"email": user["email"]},
            ip_address=client_ip(request),
        )

        return jsjson({"message": "User deleted"})
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"User delete error: {exc}")
        raise SimpleError("Failed to delete user", 500) from None


@router.post("/{user_id}/impersonate")
async def impersonate(
    user_id: str, request: Request, admin: AdminUser = Depends(super_admin_auth)
):
    try:
        target = await query_one(
            "SELECT id, name, email, role FROM users WHERE id = $1", user_id
        )
        if not target:
            raise SimpleError("User not found", 404)

        if target.get("role") in ("admin", "super_admin"):
            raise SimpleError("Cannot impersonate an admin account", 403)

        # `expiresIn: '15m'` — PyJWT adds no claims of its own, unlike jsonwebtoken,
        # so `iat`/`exp` are set explicitly. Both are volatile, so the parity spec
        # normalises the token rather than trying to match it.
        now = datetime.now(UTC)
        token = jwt.encode(
            {
                "userId": str(target["id"]),
                "email": target["email"],
                "impersonatedBy": admin.user_id,
                "iat": int(now.timestamp()),
                "exp": int(
                    (now + timedelta(seconds=IMPERSONATION_SECONDS)).timestamp()
                ),
            },
            get_jwt_secret(),
            algorithm="HS256",
        )

        await log_action(
            admin_id=admin.user_id,
            action="user.impersonate",
            target_type="user",
            target_id=str(target["id"]),
            details={"targetEmail": target["email"]},
            ip_address=client_ip(request),
        )

        return jsjson(
            {
                "token": token,
                "user": {
                    "id": str(target["id"]),
                    "name": target["name"],
                    "email": target["email"],
                },
                "expiresIn": IMPERSONATION_SECONDS,
            }
        )
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Impersonation error: {exc}")
        raise SimpleError("Failed to create impersonation session", 500) from None


async def _json_body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}
