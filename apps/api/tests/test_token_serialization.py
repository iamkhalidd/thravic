"""Regression: JWT payloads must not contain asyncpg's ``uuid.UUID`` objects.

``generate_tokens`` is called with ``user["id"]`` straight from asyncpg, which
returns UUID columns as ``uuid.UUID``. PyJWT JSON-encodes the payload, so a raw
UUID raised "Object of type UUID is not JSON serializable" and ``POST
/api/auth/login`` returned 500 in production. node-postgres returned plain
strings, which is why the original Express backend never hit this.
"""

from __future__ import annotations

import uuid

from app.routers.auth import generate_tokens


async def test_generate_tokens_accepts_uuid_user_id() -> None:
    tokens = await generate_tokens(uuid.uuid4(), "user@example.com")

    assert tokens["accessToken"]
    assert tokens["refreshToken"]
