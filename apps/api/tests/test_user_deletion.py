"""Deleting a user keeps the records that point at them.

Audit entries, settings changes, promo codes and redemptions had foreign keys
with no ON DELETE action, so deleting anyone who had any of them failed (the
admin "Delete" button answered 500). They now keep their data with the link
cleared (0018).
"""

from __future__ import annotations

import uuid

import httpx

from app.main import app
from app.middleware.admin_auth import AdminUser, admin_auth, super_admin_auth
from tests.conftest import requires_test_db

pytestmark = requires_test_db


async def test_a_user_with_admin_history_can_be_deleted(db_pool):
    tag = uuid.uuid4().hex[:10]
    async with db_pool.acquire() as conn:
        user_id = await conn.fetchval(
            "INSERT INTO users (email, name, role) VALUES ($1, 'Former Admin', 'admin') "
            "RETURNING id",
            f"former-{tag}@example.invalid",
        )
        audit_id = await conn.fetchval(
            "INSERT INTO admin_audit_log (admin_id, action, target_type) "
            "VALUES ($1, 'user.suspend', 'user') RETURNING id",
            user_id,
        )
        await conn.execute(
            "INSERT INTO system_settings (key, value, updated_by) VALUES ($1, 'true', $2)",
            f"test.{tag}",
            user_id,
        )
        promo_id = await conn.fetchval(
            "INSERT INTO promo_codes (code, discount_type, discount_value, created_by) "
            "VALUES ($1, 'percentage', 10, $2) RETURNING id",
            f"T{tag}".upper(),
            user_id,
        )
        await conn.execute(
            "INSERT INTO promo_redemptions "
            "(promo_code_id, user_id, plan, original_amount, discounted_amount) "
            "VALUES ($1, $2, 'pro', 4500000, 4050000)",
            promo_id,
            user_id,
        )

    deleter = AdminUser(
        user_id="00000000-0000-4000-8000-0000000000aa", email="s@x.invalid", role="super_admin"
    )
    app.dependency_overrides[admin_auth] = lambda: deleter
    app.dependency_overrides[super_admin_auth] = lambda: deleter
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://t"
        ) as client:
            response = await client.delete(f"/api/admin/users/{user_id}")
    finally:
        app.dependency_overrides.clear()

    async with db_pool.acquire() as conn:
        gone = await conn.fetchval("SELECT 1 FROM users WHERE id = $1", user_id) is None
        audit = await conn.fetchval("SELECT admin_id FROM admin_audit_log WHERE id = $1", audit_id)
        setting = await conn.fetchrow(
            "SELECT updated_by FROM system_settings WHERE key = $1", f"test.{tag}"
        )
        promo = await conn.fetchrow("SELECT created_by FROM promo_codes WHERE id = $1", promo_id)
        redemption = await conn.fetchrow(
            "SELECT user_id FROM promo_redemptions WHERE promo_code_id = $1", promo_id
        )
        await conn.execute("DELETE FROM admin_audit_log WHERE id = $1", audit_id)
        await conn.execute("DELETE FROM system_settings WHERE key = $1", f"test.{tag}")
        await conn.execute("DELETE FROM promo_redemptions WHERE promo_code_id = $1", promo_id)
        await conn.execute("DELETE FROM promo_codes WHERE id = $1", promo_id)

    assert response.status_code == 200, response.json()
    assert gone
    # Every record is kept, with the link to the deleted user cleared.
    assert audit is None
    assert setting is not None and setting["updated_by"] is None
    assert promo is not None and promo["created_by"] is None
    assert redemption is not None and redemption["user_id"] is None


async def test_an_admin_plan_grant_takes_effect_for_a_lapsed_user(db_pool, make_plan):
    from app.services import plan_service

    plan = await make_plan()
    async with db_pool.acquire() as conn:
        user_id = str(
            await conn.fetchval(
                "INSERT INTO users (email, name) VALUES ($1, 'Lapsed') RETURNING id",
                f"lapsed-{uuid.uuid4().hex[:10]}@example.invalid",
            )
        )
        # Paid long ago, lapsed.
        await conn.execute(
            "INSERT INTO subscriptions (user_id, plan, status, events_limit, domains_limit, "
            "current_period_end) VALUES ($1, 'pro', 'active', 0, 0, NOW() - INTERVAL '40 days')",
            user_id,
        )

    admin = AdminUser(
        user_id="00000000-0000-4000-8000-0000000000aa", email="a@x.invalid", role="admin"
    )
    app.dependency_overrides[admin_auth] = lambda: admin
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://t"
        ) as client:
            response = await client.patch(
                f"/api/admin/users/{user_id}", json={"subscription": plan}
            )
        granted = await plan_service.for_user(user_id)
    finally:
        app.dependency_overrides.clear()
        async with db_pool.acquire() as conn:
            await conn.execute("DELETE FROM users WHERE id = $1", user_id)

    assert response.status_code == 200, response.json()
    assert granted.name == plan  # not left on free by the lapsed end date
