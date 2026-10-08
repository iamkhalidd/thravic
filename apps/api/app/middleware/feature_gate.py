"""Feature gating by subscription plan — port of `middleware/featureGate.ts`.

Two behaviours are reproduced exactly because they are observable:

1. When `domainId` is present in the path or query, the **domain owner's**
   subscription is checked, so invited team members can use Pro features on
   domains they were invited to.
2. On an unexpected error it fails **open** in development and **closed** in
   production.
"""

from __future__ import annotations

from fastapi import Depends, Request

from ..config import get_settings
from ..db import query_one
from ..errors import PayloadError, SimpleError
from ..logging import create_logger
from ..plans import PLAN_FEATURES, get_plan_for_feature
from ..services import plan_catalog
from .auth import AuthUser, require_auth

log = create_logger("FeatureGate")

_PLAN_QUERY = """
SELECT COALESCE(
    (SELECT plan FROM subscriptions
     WHERE user_id = $1 AND status = 'active'
     ORDER BY created_at DESC LIMIT 1),
    'free'
) AS plan
"""


def _denied_payload(feature: str, required_plan: str, current_plan: str) -> dict[str, object]:
    return {
        "error": f'The "{feature}" feature requires the {required_plan} plan or above.',
        "upgrade": True,
        "requiredPlan": required_plan,
        "currentPlan": current_plan,
    }


def _free_plan_denied_payload(feature: str) -> dict[str, object]:
    return {
        "error": f'The "{feature}" feature is not available on the Free plan.',
        "upgrade": True,
        "requiredPlan": get_plan_for_feature(feature),
        "currentPlan": "free",
    }


async def _resolve_target_user_id(user_id: str, domain_id: str | None) -> str:
    """Check the domain owner's plan when a domain is in scope."""
    if not domain_id:
        return user_id

    row = await query_one("SELECT user_id FROM domains WHERE id = $1", domain_id)
    return row["user_id"] if row else user_id


def require_feature(feature: str):
    """Dependency factory. Use after `require_auth`."""

    async def dependency(
        request: Request, user: AuthUser = Depends(require_auth)
    ) -> None:
        settings = get_settings()

        try:
            # No database configured — evaluate against the free plan
            if not settings.DATABASE_URL:
                if feature not in PLAN_FEATURES["free"]:
                    raise PayloadError(_free_plan_denied_payload(feature), 403)
                return

            domain_id = request.path_params.get("domainId") or request.query_params.get(
                "domainId"
            )
            target_user_id = await _resolve_target_user_id(user.user_id, domain_id)

            row = await query_one(_PLAN_QUERY, target_user_id)
            plan = ((row["plan"] if row else "free") or "free").lower().strip()
            allowed = (await plan_catalog.get(plan)).features

            if feature not in allowed:
                required_plan = await plan_catalog.lowest_plan_with(feature)
                log.info(
                    f'Feature gate denied: user {user.user_id} (plan={plan}) '
                    f'tried to access "{feature}"'
                )
                raise PayloadError(_denied_payload(feature, required_plan, plan), 403)

        except PayloadError:
            raise
        except Exception as exc:
            log.error(f"Feature gate error: {exc}")
            # Fail open in dev, fail closed in production
            if settings.is_production:
                raise SimpleError("Failed to verify subscription", 500) from None
            return

    return dependency
