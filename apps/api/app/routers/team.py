"""Team routes — port of `routes/team.ts`.

Split permissions, preserved from Express:

* `GET /members` only needs *access* (owner or any member) and returns 403
  `Access denied` otherwise.
* `POST /invite` and `DELETE /members/:memberId` need *admin* rights (owner, or a
  member whose role is exactly `admin`) and return 403 `Requires admin permissions`.

Invites past the owner's plan `team_limit` (people across all their sites) are
refused with 403 and `upgrade: true`.

Invites require the target user to already exist — there is no pending-invite
table, so an unknown email is a 404 rather than a queued invitation.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ..db import query, query_one
from ..errors import PayloadError, SimpleError
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.auth import AuthUser, require_auth
from ..middleware.feature_gate import require_feature
from ..services import plan_service
from ..zod_lite import (
    enum_field,
    string_field,
)

log = create_logger("Team")

router = APIRouter()

ROLES = ("admin", "viewer")

ACCESS_DENIED = "Access denied"
ADMIN_REQUIRED = "Requires admin permissions"
FAILED_INVITE = "Failed to invite member"


async def _require_access(domain_id: str, user_id: str) -> None:
    access = await query_one(
        """
        SELECT 1 FROM domains WHERE id = $1 AND user_id = $2
        UNION
        SELECT 1 FROM domain_members WHERE domain_id = $1 AND user_id = $2
        """,
        domain_id,
        user_id,
    )
    if access is None:
        raise SimpleError(ACCESS_DENIED, 403)


async def _require_admin(domain_id: str, user_id: str) -> None:
    owner = await query_one(
        "SELECT id FROM domains WHERE id = $1 AND user_id = $2", domain_id, user_id
    )
    if owner is not None:
        return

    member = await query_one(
        "SELECT role FROM domain_members WHERE domain_id = $1 AND user_id = $2 AND role = 'admin'",
        domain_id,
        user_id,
    )
    if member is not None:
        return

    raise SimpleError(ADMIN_REQUIRED, 403)


@router.get("/{domainId}/members")
async def list_members(
    domainId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("team")),
):
    await _require_access(domainId, user.user_id)

    members = await query(
        """
        SELECT u.id, u.name, u.email, 'owner' as role, d.created_at
        FROM domains d
        JOIN users u ON d.user_id = u.id
        WHERE d.id = $1
        UNION
        SELECT u.id, u.name, u.email, dm.role, dm.created_at
        FROM domain_members dm
        JOIN users u ON dm.user_id = u.id
        WHERE dm.domain_id = $1
        ORDER BY created_at ASC
        """,
        domainId,
    )
    return jsjson(members)


async def _check_team_limit(domain_id: str, target_id: str) -> None:
    """Refuse a new person past the owner's plan `team_limit`.

    Seats are people, counted across all of the owner's sites; someone already on
    any of them (or a role change) takes no new seat.
    """
    owner = await query_one("SELECT user_id FROM domains WHERE id = $1", domain_id)
    if not owner:
        return
    plan = await plan_service.for_user(str(owner["user_id"]))
    if plan.team_limit is None:
        return
    members = await query(
        """
        SELECT DISTINCT dm.user_id FROM domain_members dm
        JOIN domains d ON d.id = dm.domain_id
        WHERE d.user_id = $1 AND dm.user_id <> $1
        """,
        owner["user_id"],
    )
    ids = {str(row["user_id"]) for row in members}
    if target_id in ids or target_id == str(owner["user_id"]):
        return
    if len(ids) >= plan.team_limit:
        raise PayloadError(
            {
                "error": (
                    f"Your plan allows {plan.team_limit} team member"
                    f"{'' if plan.team_limit == 1 else 's'}. Upgrade to invite more."
                ),
                "upgrade": True,
            },
            403,
        )


@router.post("/{domainId}/invite")
async def invite_member(
    domainId: str,
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("team")),
):
    try:
        await _require_admin(domainId, user.user_id)

        try:
            body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}

        issues: list[dict] = []
        email, issue = string_field(body, "email", is_email=True)
        if issue:
            issues.append(issue)

        role, issue = enum_field(body, "role", ROLES, required=False, default="viewer")
        if issue:
            issues.append(issue)

        if issues:
            # Express returns the whole Zod issue array here
            raise PayloadError({"error": issues}, 400)

        target = await query_one("SELECT id FROM users WHERE email = $1", email)
        if target is None:
            raise SimpleError("User not found. They must register first.", 404)

        await _check_team_limit(domainId, str(target["id"]))

        await query(
            """
            INSERT INTO domain_members (domain_id, user_id, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (domain_id, user_id) DO UPDATE SET role = $3
            """,
            domainId,
            target["id"],
            role,
        )

        return jsjson({"message": "Member added successfully"})
    except (PayloadError, SimpleError):
        raise
    except Exception as exc:
        log.error(f"Invite member error: {exc}")
        raise SimpleError(FAILED_INVITE, 500) from None


@router.delete("/{domainId}/members/{memberId}")
async def remove_member(
    domainId: str,
    memberId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("team")),
):
    await _require_admin(domainId, user.user_id)

    await query(
        "DELETE FROM domain_members WHERE domain_id = $1 AND user_id = $2",
        domainId,
        memberId,
    )
    return jsjson({"message": "Member removed"})
