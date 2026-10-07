"""Suspension blocks sign-in — it used to be a role nothing checked.

`POST /api/admin/users/{id}/suspend` set `role = 'suspended'` and emailed the user
that they were locked out, but login, refresh and OAuth never looked at the role.
Skipped unless `THRAVIC_TEST_DATABASE_URL` is set.
"""

from __future__ import annotations

import uuid

import pytest

from app.errors import SimpleError
from app.routers.auth import generate_tokens
from tests.conftest import requires_test_db

pytestmark = requires_test_db


@pytest.fixture
async def user_with_role(db_pool):
    created: list[uuid.UUID] = []

    async def _make(role: str) -> str:
        user_id = uuid.uuid4()
        async with db_pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO users (id, email, name, role) VALUES ($1, $2, 'Suspension', $3)",
                user_id,
                f"suspension-{user_id.hex}@example.invalid",
                role,
            )
        created.append(user_id)
        return str(user_id)

    yield _make
    async with db_pool.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE id = ANY($1::uuid[])", created)


async def test_suspended_user_cannot_get_tokens(user_with_role):
    user_id = await user_with_role("suspended")

    with pytest.raises(SimpleError) as raised:
        await generate_tokens(user_id, "x@example.invalid")

    assert raised.value.status_code == 403


async def test_active_user_gets_tokens(user_with_role):
    user_id = await user_with_role("user")

    tokens = await generate_tokens(user_id, "x@example.invalid")

    assert tokens["accessToken"] and tokens["refreshToken"]
