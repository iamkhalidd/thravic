"""`retry_transient` — retry connection blips, never data errors.

A synchronous collect request is exposed to short Postgres failures (Neon cold
starts, pooler recycling, a statement cancelled by a timeout). Those are worth
another attempt; a constraint violation is not. A blanket retry would hammer the
database for an error that can never succeed, so the classification is the point
of this module.
"""

from __future__ import annotations

import asyncpg.exceptions
import pytest

from app.db import is_transient, retry_transient


class Boom(Exception):
    """Neither transient nor a Postgres error."""


@pytest.mark.parametrize(
    "exc",
    [
        asyncpg.exceptions.ConnectionDoesNotExistError("gone"),
        asyncpg.exceptions.ConnectionFailureError("refused"),
        asyncpg.exceptions.AdminShutdownError("shutting down"),
        asyncpg.exceptions.CannotConnectNowError("starting up"),
        asyncpg.exceptions.TooManyConnectionsError("too many clients"),
        asyncpg.exceptions.QueryCanceledError("statement timeout"),
        asyncpg.exceptions.DeadlockDetectedError("deadlock"),
        asyncpg.exceptions.SerializationError("could not serialize"),
        ConnectionError("reset by peer"),
        TimeoutError("timed out"),
        OSError("network unreachable"),
    ],
)
def test_connection_level_failures_are_transient(exc):
    assert is_transient(exc) is True


@pytest.mark.parametrize(
    "exc",
    [
        asyncpg.exceptions.UniqueViolationError("duplicate key"),
        asyncpg.exceptions.IntegrityConstraintViolationError("constraint"),
        asyncpg.exceptions.NotNullViolationError("null value"),
        asyncpg.exceptions.DataError("bad value"),
        Boom("permanent"),
        ValueError("programming mistake"),
    ],
)
def test_data_and_programming_errors_are_not_transient(exc):
    assert is_transient(exc) is False


async def test_returns_without_retrying_on_success():
    calls: list[int] = []

    async def ok():
        calls.append(1)
        return "done"

    assert await retry_transient(ok, description="op") == "done"
    assert calls == [1]


async def test_retries_a_transient_failure_then_succeeds():
    calls: list[int] = []

    async def flaky():
        calls.append(1)
        if len(calls) == 1:
            raise ConnectionError("connection reset")
        return "recovered"

    assert await retry_transient(flaky, description="op", base_delay=0) == "recovered"
    assert calls == [1, 1]


async def test_a_permanent_failure_is_raised_on_the_first_attempt():
    calls: list[int] = []

    async def broken():
        calls.append(1)
        raise asyncpg.exceptions.UniqueViolationError("duplicate key")

    with pytest.raises(asyncpg.exceptions.UniqueViolationError):
        await retry_transient(broken, description="op", base_delay=0)

    assert calls == [1]


async def test_gives_up_after_the_attempt_limit():
    calls: list[int] = []

    async def always_down():
        calls.append(1)
        raise ConnectionError("still down")

    with pytest.raises(ConnectionError):
        await retry_transient(always_down, description="op", attempts=3, base_delay=0)

    assert calls == [1, 1, 1]
