"""Regression: JWT payloads must not contain asyncpg's ``uuid.UUID`` objects.

``generate_tokens`` is called with ``user["id"]`` straight from asyncpg, which
returns UUID columns as ``uuid.UUID``. PyJWT JSON-encodes the payload, so a raw
UUID raised "Object of type UUID is not JSON serializable" and ``POST
/api/auth/login`` returned 500 in production. node-postgres returned plain
strings, which is why the original Express backend never hit this.
"""

from __future__ import annotations

import uuid

import pytest

from app.errors import SimpleError
from app.routers.auth import generate_tokens
from app.services import user_service


@pytest.fixture
def account(monkeypatch):
    """The user row `generate_tokens` reads to enforce suspension."""
    row = {"role": "user"}

    async def _find_by_id(_user_id):
        return row

    monkeypatch.setattr(user_service, "find_by_id", _find_by_id)
    return row


async def test_generate_tokens_accepts_uuid_user_id(account) -> None:
    tokens = await generate_tokens(uuid.uuid4(), "user@example.com")

    assert tokens["accessToken"]
    assert tokens["refreshToken"]


async def test_a_suspended_account_gets_no_tokens(account) -> None:
    """Login, refresh and OAuth all issue tokens here, so this blocks every sign-in."""
    account["role"] = "suspended"

    with pytest.raises(SimpleError) as raised:
        await generate_tokens(uuid.uuid4(), "user@example.com")

    assert raised.value.status_code == 403
