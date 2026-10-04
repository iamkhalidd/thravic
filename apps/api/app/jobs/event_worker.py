"""Background event queue drainer — port of `jobs/eventWorker.ts`.

Drains `thravic:events_queue`, which `POST /api/collect/:trackingId` LPUSHes onto
and returns 202 for immediately. Sessions are upserted first (concurrently, with
individual failures swallowed — `Promise.allSettled`), then the events are written
in one batch.

⚠️ **This worker drops data, and that is reproduced deliberately.** The queue is
drained with RPOP *before* anything is persisted, so any failure after the pop
loses those events permanently — they are already off the queue and nothing
re-queues them. That is bad on its own, but combined with the `events.session_id`
UUID/session-string mismatch recorded in the repo notes, the batch insert *always*
fails, so in practice this worker consumes and discards everything the tracker
sends. It is ported as-is because changing it here would make FastAPI diverge from
Express, which is exactly what the parity gate exists to catch; fixing it is a
product decision.

Timing mirrors the original's self-scheduling recursion: a full batch re-runs
immediately (`setImmediate`), a short batch waits `WAIT_TIME`, and an error waits
`ERROR_WAIT_TIME`.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from ..logging import create_logger
from ..redis_client import get_client
from ..services import event_service, session_service

log = create_logger("EventWorker")

QUEUE_KEY = "thravic:events_queue"
BATCH_SIZE = 50
WAIT_TIME_SECONDS = 1.0
ERROR_WAIT_TIME_SECONDS = 5.0

_shutting_down = False
_running = False
_task: asyncio.Task | None = None


def _session_params(event: dict[str, Any]) -> dict[str, Any]:
    """`sessionService.upsert({...})` as the worker calls it.

    NOTE: `source` is read straight off the queued payload, but `collect.ts` never
    puts a `source` key on it (it only records `sourceType`). So this is always
    `None` and the session's `source` column is never populated by this path —
    faithfully wrong, not an oversight.
    """
    return {
        "sessionId": event.get("sessionId"),
        "domainId": event.get("domainId"),
        "visitorId": event.get("visitorId"),
        "source": event.get("source"),
        "sourceType": event.get("sourceType"),
        "referrer": event.get("referrer"),
        "utmSource": event.get("utmSource"),
        "utmMedium": event.get("utmMedium"),
        "utmCampaign": event.get("utmCampaign"),
        "utmTerm": event.get("utmTerm"),
        "utmContent": event.get("utmContent"),
        "userAgent": event.get("userAgent"),
        "screenWidth": event.get("screenWidth"),
        "screenHeight": event.get("screenHeight"),
        "language": event.get("language"),
        "country": event.get("country"),
        "region": event.get("region"),
        "city": event.get("city"),
    }


def _event_params(event: dict[str, Any]) -> dict[str, Any]:
    """`eventService.batchInsert({...})` as the worker calls it.

    Note there is no `utmTerm`/`utmContent` — the batch insert does not carry them,
    matching the Express mapping.
    """
    return {
        "domainId": event.get("domainId"),
        "sessionId": event.get("sessionId"),
        "visitorId": event.get("visitorId"),
        "type": event.get("type"),
        "url": event.get("url"),
        "referrer": event.get("referrer"),
        "utmSource": event.get("utmSource"),
        "utmMedium": event.get("utmMedium"),
        "utmCampaign": event.get("utmCampaign"),
        "data": event.get("data"),
    }


async def _pop_batch() -> list[dict[str, Any]] | None:
    """Pop up to `BATCH_SIZE` events. `None` means the read itself failed.

    LPUSH on the ingest side plus RPOP here is a FIFO queue, so events are drained
    oldest-first.
    """
    client = get_client()
    if client is None:
        # Express's `rpop` rejects and lands in the same error branch. Logged at
        # debug because this repeats every loop while Redis is intentionally off.
        log.debug("Redis unavailable — cannot drain the events queue")
        return None

    try:
        events: list[dict[str, Any]] = []
        for _ in range(BATCH_SIZE):
            raw = await client.rpop(QUEUE_KEY)
            if raw is None:
                break
            events.append(json.loads(raw))
        return events
    except Exception as exc:  # noqa: BLE001 — a bad entry must not kill the worker
        log.error(f"Failed to read event queue: {exc}")
        return None


async def _process_once() -> None:
    """One drain iteration, including the wait before the next one."""
    if _shutting_down:
        return

    events = await _pop_batch()
    if events is None:
        await asyncio.sleep(ERROR_WAIT_TIME_SECONDS)
        return

    if not events:
        await asyncio.sleep(WAIT_TIME_SECONDS)
        return

    log.info(f"Processing batch of {len(events)} events...")

    try:
        # `Promise.allSettled` — one bad session must not abandon the whole batch.
        await asyncio.gather(
            *(session_service.upsert(_session_params(event)) for event in events),
            return_exceptions=True,
        )

        inserted = await event_service.batch_insert(
            [_event_params(event) for event in events]
        )
        log.info(f"Successfully stored {inserted} events into Postgres.")
    except Exception as exc:  # noqa: BLE001 — mirrors the TS catch-all
        log.error(f"Failed to process event batch: {exc}")
        # The events are already off the queue and are now lost.
        await asyncio.sleep(ERROR_WAIT_TIME_SECONDS)
        return

    # A full batch usually means more is waiting, so loop straight back round.
    await asyncio.sleep(0 if len(events) == BATCH_SIZE else WAIT_TIME_SECONDS)


async def _run() -> None:
    while not _shutting_down:
        try:
            await _process_once()
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — the worker must never die
            log.error(f"Event worker iteration failed: {exc}")
            await asyncio.sleep(ERROR_WAIT_TIME_SECONDS)


def start_event_worker() -> None:
    """Start the drainer. Equivalent to `startEventWorker()`."""
    global _running, _task, _shutting_down

    if _running:
        return

    # Without Redis there is no queue to drain; don't spin a worker that would
    # only log "Redis unavailable" every few seconds.
    if get_client() is None:
        log.warning("Redis unavailable — event worker not started (draining disabled)")
        return

    _running = True
    _shutting_down = False
    log.info("Started background event processing worker")
    _task = asyncio.create_task(_run())


async def stop_event_worker() -> None:
    """Stop the drainer and wait for the in-flight batch, like `stopEventWorker()`."""
    global _running, _task, _shutting_down

    log.info("Shutting down event worker gracefully...")
    _shutting_down = True

    if _task is not None:
        _task.cancel()
        try:
            await _task
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass
        _task = None

    _running = False
