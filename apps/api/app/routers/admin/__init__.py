"""Admin API — port of `routes/admin/index.ts`.

`adminAuth` is applied to this whole tree, exactly as `index.ts` does with
`router.use(adminAuth)`. Two details are deliberate:

* `users.ts` overrides it with `superAdminAuth` for the destructive routes. The
  global check still runs first, so an ordinary admin passes that and is then
  rejected with the super-admin message — which is the behaviour Express has.
* `plans.ts` and `promos.ts` declare **no** per-route auth at all and rely
  entirely on the global check, so the dependency has to stay on the parent
  router. Moving it into the sub-routers would silently open those two up.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ...json_response import jsjson
from ...middleware.admin_auth import AdminUser, admin_auth
from . import (
    audit,
    dashboard,
    domains,
    events,
    export,
    growth,
    plans,
    product_updates,
    promos,
    retention,
    revenue,
    session,
    settings,
    subscriptions,
    system,
    users,
)

router = APIRouter()

_SUBROUTERS = (
    (dashboard, "/dashboard"),
    (users, "/users"),
    (domains, "/domains"),
    (subscriptions, "/subscriptions"),
    (events, "/events"),
    (system, "/system"),
    (audit, "/audit"),
    (settings, "/settings"),
    (retention, "/retention"),
    (export, "/export"),
    (plans, "/plans"),
    (promos, "/promos"),
    (product_updates, "/product-updates"),
    (revenue, "/revenue"),
    (growth, "/growth"),
)

for _module, _prefix in _SUBROUTERS:
    router.include_router(
        _module.router, prefix=_prefix, dependencies=[Depends(admin_auth)]
    )


# Sign-in happens before there is an admin token, so it is outside admin_auth.
router.include_router(session.router, prefix="/auth")


@router.get("/me")
async def me(admin: AdminUser = Depends(admin_auth)):
    """The signed-in admin's role, so the panel can show super-admin actions.

    The role is not in the JWT, so the panel cannot read it from the token.
    """
    return jsjson({"id": admin.user_id, "email": admin.email, "role": admin.role})
