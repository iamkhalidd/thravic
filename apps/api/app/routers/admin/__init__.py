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

from ...middleware.admin_auth import admin_auth
from . import (
    audit,
    dashboard,
    domains,
    events,
    export,
    plans,
    promos,
    retention,
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
)

for _module, _prefix in _SUBROUTERS:
    router.include_router(
        _module.router, prefix=_prefix, dependencies=[Depends(admin_auth)]
    )
