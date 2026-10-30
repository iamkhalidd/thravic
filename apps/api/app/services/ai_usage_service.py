"""What each call to the AI model used, for the admin's AI usage page.

The model is called from three places (the daily insights report, "Explain
this change" and the assistant). Each wraps its work in `scope(feature, domain)`
and the code that calls the provider then calls `record(...)` with the
response's `usage`, so the call sites don't pass the site through every helper.

Writing the row never affects the answer: without a database, or on any error,
nothing is recorded.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

from .. import db
from ..logging import create_logger

log = create_logger("AIUsage")

FEATURES = ("insights", "explain", "assistant")

_scope: ContextVar[tuple[str, str | None] | None] = ContextVar("ai_usage_scope", default=None)


@contextmanager
def scope(feature: str, domain_id: Any = None) -> Iterator[None]:
    """Attribute the model calls made inside this block to `feature` on `domain_id`."""
    token = _scope.set((feature, str(domain_id) if domain_id else None))
    try:
        yield
    finally:
        _scope.reset(token)


def _tokens(usage: Any, key: str) -> int:
    value = usage.get(key) if isinstance(usage, dict) else None
    return value if isinstance(value, int) and value >= 0 else 0


async def record(usage: Any, ok: bool) -> None:
    """One `ai_usage` row for the call that just finished (`usage` is the provider's)."""
    if db.pool is None:
        return
    feature, domain_id = _scope.get() or ("other", None)
    try:
        await db.execute(
            """
            INSERT INTO ai_usage (feature, domain_id, user_id, prompt_tokens, completion_tokens, ok)
            VALUES ($1, $2::uuid, (SELECT user_id FROM domains WHERE id = $2::uuid), $3, $4, $5)
            """,
            feature,
            domain_id,
            _tokens(usage, "prompt_tokens"),
            _tokens(usage, "completion_tokens"),
            ok,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning(f"Could not record AI usage: {exc}")
