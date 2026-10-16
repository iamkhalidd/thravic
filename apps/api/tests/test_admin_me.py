"""`GET /api/admin/me` tells the admin panel the signed-in admin's role.

The role is not a JWT claim, so the panel cannot read it from the token.
"""

from __future__ import annotations

import json

from app.middleware.admin_auth import AdminUser
from app.routers.admin import me, router


async def test_me_returns_the_admins_role():
    response = await me(AdminUser(user_id="u1", email="a@example.com", role="super_admin"))

    assert json.loads(response.body) == {
        "id": "u1",
        "email": "a@example.com",
        "role": "super_admin",
    }


def test_me_is_mounted_on_the_admin_router():
    assert "/me" in {getattr(route, "path", None) for route in router.routes}
