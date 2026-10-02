"""Event worker and traffic-alert job.

These run outside the request cycle, so an HTTP-level diff against the old
backend never exercised them: nothing here changes a response. They are covered
directly instead.

Two behaviours are asserted because they are *bugs*, not features, and the port
reproduces them on purpose:

* the queue is drained with RPOP before anything is persisted, so a failure after
  the pop loses those events permanently;
* the worker passes `source` straight through from the queued payload, which
  `collect.ts` never sets, so `sessions.source` is never populated by this path.

If either is ever fixed, these tests should be updated deliberately — which is the
point of writing them down.
"""

from __future__ import annotations

import json
import os

import pytest

from app import cache
from app.jobs import event_worker
from app.redis_client import init_redis


@pytest.fixture(autouse=True)
async def _redis(monkeypatch):
    if not os.getenv("REDIS_URL"):
        pytest.skip("REDIS_URL not set")
    await init_redis()
    client = cache.get_client()
    if client is None:
        pytest.skip("Redis unavailable")
    try:
        await client.ping()
    except Exception:
        pytest.skip("Redis unavailable")

    # Use a private queue key. The API server runs its own event worker against
    # the same Redis, and if these tests used the real key that worker would race
    # them for every pop — which is exactly how this suite first failed.
    monkeypatch.setattr(event_worker, "QUEUE_KEY", "thravic:events_queue:test")

    await client.delete(event_worker.QUEUE_KEY)
    event_worker._shutting_down = False
    event_worker._running = False

    yield client

    await client.delete(event_worker.QUEUE_KEY)


def _event(index: int = 0) -> dict:
    return {
        "domainId": "aaaaaaaa-0000-0000-0000-000000000001",
        "sessionId": f"parity-session-{index}",
        "visitorId": f"parity-visitor-{index}",
        "type": "pageview",
        "url": "https://parity-pro.example/",
        "referrer": None,
        "utmSource": None,
        "utmMedium": None,
        "utmCampaign": None,
        "data": {},
        "userAgent": "pytest",
        "sourceType": "direct",
        "receivedAt": "2026-09-17T00:00:00.000Z",
    }


async def _enqueue(client, events: list[dict]) -> None:
    """LPUSH, the way the collect route does — so RPOP drains oldest-first."""
    for event in events:
        await client.lpush(event_worker.QUEUE_KEY, json.dumps(event))


async def test_drains_the_queue_oldest_first(_redis, monkeypatch):
    """LPUSH + RPOP is a FIFO queue; the worker must not reorder."""
    await _enqueue(_redis, [_event(0), _event(1), _event(2)])

    batches: list[list[dict]] = []

    async def fake_batch_insert(events):
        batches.append(events)
        return len(events)

    async def fake_upsert(params):
        return None

    monkeypatch.setattr(event_worker.event_service, "batch_insert", fake_batch_insert)
    monkeypatch.setattr(event_worker.session_service, "upsert", fake_upsert)
    monkeypatch.setattr(event_worker.asyncio, "sleep", _no_sleep)

    await event_worker._process_once()

    assert len(batches) == 1
    assert [row["sessionId"] for row in batches[0]] == [
        "parity-session-0",
        "parity-session-1",
        "parity-session-2",
    ]
    # The queue is empty afterwards
    assert await _redis.llen(event_worker.QUEUE_KEY) == 0


async def test_uses_rpop_not_lpop(_redis, monkeypatch):
    """A regression guard: LPOP would reverse event order."""
    await _enqueue(_redis, [_event(0), _event(1)])

    seen: list[str] = []

    async def fake_batch_insert(events):
        seen.extend(row["sessionId"] for row in events)
        return len(events)

    monkeypatch.setattr(event_worker.event_service, "batch_insert", fake_batch_insert)
    monkeypatch.setattr(
        event_worker.session_service, "upsert", _async_none
    )
    monkeypatch.setattr(event_worker.asyncio, "sleep", _no_sleep)

    await event_worker._process_once()

    # `_event(0)` was pushed first, so it must come out first.
    assert seen == ["parity-session-0", "parity-session-1"]


async def test_caps_a_batch_at_the_batch_size(_redis, monkeypatch):
    await _enqueue(_redis, [_event(i) for i in range(event_worker.BATCH_SIZE + 5)])

    batches: list[int] = []

    async def fake_batch_insert(events):
        batches.append(len(events))
        return len(events)

    monkeypatch.setattr(event_worker.event_service, "batch_insert", fake_batch_insert)
    monkeypatch.setattr(event_worker.session_service, "upsert", _async_none)
    monkeypatch.setattr(event_worker.asyncio, "sleep", _no_sleep)

    await event_worker._process_once()
    assert batches == [event_worker.BATCH_SIZE]

    # The remainder is still queued for the next iteration.
    assert await _redis.llen(event_worker.QUEUE_KEY) == 5


async def test_session_upserts_pass_source_as_none(_redis, monkeypatch):
    """The queued payload has no `source`, so `sessions.source` stays empty."""
    await _enqueue(_redis, [_event(0)])

    received: list[dict] = []

    async def fake_upsert(params):
        received.append(params)
        return None

    async def fake_batch_insert(events):
        return len(events)

    monkeypatch.setattr(event_worker.session_service, "upsert", fake_upsert)
    monkeypatch.setattr(event_worker.event_service, "batch_insert", fake_batch_insert)
    monkeypatch.setattr(event_worker.asyncio, "sleep", _no_sleep)

    await event_worker._process_once()

    assert len(received) == 1
    assert received[0]["source"] is None
    assert received[0]["sourceType"] == "direct"


async def test_a_failing_insert_loses_the_batch(_redis, monkeypatch):
    """Documented data loss: the events are already off the queue."""
    await _enqueue(_redis, [_event(0), _event(1)])

    async def exploding_batch_insert(events):
        raise RuntimeError("invalid UUID 'parity-session-0'")

    monkeypatch.setattr(
        event_worker.event_service, "batch_insert", exploding_batch_insert
    )
    monkeypatch.setattr(event_worker.session_service, "upsert", _async_none)
    monkeypatch.setattr(event_worker.asyncio, "sleep", _no_sleep)

    await event_worker._process_once()

    # Nothing was written and nothing was re-queued.
    assert await _redis.llen(event_worker.QUEUE_KEY) == 0


async def test_a_failing_session_upsert_does_not_abandon_the_batch(
    _redis, monkeypatch
):
    """`Promise.allSettled`: one bad session must not stop the insert."""
    await _enqueue(_redis, [_event(0), _event(1)])

    calls = {"upsert": 0, "insert": 0}

    async def sometimes_failing_upsert(params):
        calls["upsert"] += 1
        raise RuntimeError("session upsert failed")

    async def fake_batch_insert(events):
        calls["insert"] += 1
        return len(events)

    monkeypatch.setattr(
        event_worker.session_service, "upsert", sometimes_failing_upsert
    )
    monkeypatch.setattr(event_worker.event_service, "batch_insert", fake_batch_insert)
    monkeypatch.setattr(event_worker.asyncio, "sleep", _no_sleep)

    await event_worker._process_once()

    assert calls["upsert"] == 2
    assert calls["insert"] == 1


async def test_an_empty_queue_just_waits(_redis, monkeypatch):
    called = {"insert": False}

    async def fake_batch_insert(events):
        called["insert"] = True
        return 0

    monkeypatch.setattr(event_worker.event_service, "batch_insert", fake_batch_insert)
    monkeypatch.setattr(event_worker.asyncio, "sleep", _no_sleep)

    await event_worker._process_once()

    assert called["insert"] is False


async def test_a_malformed_entry_does_not_kill_the_worker(_redis, monkeypatch):
    await _redis.lpush(event_worker.QUEUE_KEY, "not json at all")

    monkeypatch.setattr(event_worker.session_service, "upsert", _async_none)
    monkeypatch.setattr(event_worker.event_service, "batch_insert", _insert_count)
    monkeypatch.setattr(event_worker.asyncio, "sleep", _no_sleep)

    # Must return rather than raise.
    await event_worker._process_once()

    assert await _redis.llen(event_worker.QUEUE_KEY) == 0


async def test_shutting_down_stops_processing(_redis, monkeypatch):
    await _enqueue(_redis, [_event(0)])
    event_worker._shutting_down = True

    called = {"insert": False}

    async def fake_batch_insert(events):
        called["insert"] = True
        return len(events)

    monkeypatch.setattr(event_worker.event_service, "batch_insert", fake_batch_insert)

    await event_worker._process_once()

    assert called["insert"] is False
    # The event is still queued for the next process start.
    assert await _redis.llen(event_worker.QUEUE_KEY) == 1


async def _no_sleep(_seconds):
    """Drop the real delays so the tests do not wait on the worker's timers."""
    return None


async def _async_none(*_args, **_kwargs):
    return None


async def _insert_count(events):
    return len(events)
