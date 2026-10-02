"""Small shared helpers for the admin routers."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import Request
from starlette.responses import Response

# Strong references so a background task is not garbage collected mid-flight.
_background_tasks: set[asyncio.Task] = set()


def client_ip(request: Request) -> str:
    """Approximates Express's `req.ip`.

    Express derives this from the socket (and from `X-Forwarded-For` when a trust
    proxy is configured), so behind Render the real client address arrives in the
    header. The value is stored in `admin_audit_log.ip_address`, which means it is
    environment-dependent rather than data-dependent — the parity specs normalise
    it for that reason.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return (request.client.host if request.client else "") or ""


def fire_and_forget(coro: Any) -> None:
    """Schedule `coro` without awaiting it, mirroring an un-awaited `.catch()`."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


def empty_json_response() -> Response:
    """`res.json(undefined)` — 200 with `Content-Type: application/json` and no body.

    Express reaches this when a PATCH updates zero rows: the handler answers with
    the (missing) row itself. Reproducing the empty body matters because a JSON
    `null` would be a different response.
    """
    return Response(status_code=200, media_type="application/json")
