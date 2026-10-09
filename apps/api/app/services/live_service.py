"""Live dashboard updates — tells open dashboards that a domain has new events.

Collection calls `notify(domain_id)` once it has stored events; every open
`/analytics/:id/live` stream waits on a `subscribe(domain_id)` queue. With Redis
the notice goes over pub/sub so every API instance hears it; without Redis it
stays in this process, which is all a single instance needs.

A notice carries no data. It only says "re-fetch", so a burst of events
collapses into one notice and the dashboard reads the numbers through the
normal analytics routes.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Iterator
from contextlib import contextmanager

from ..logging import create_logger
from ..redis_client import get_client

log = create_logger("Live")

CHANNEL_PREFIX = "live:"
# A busy site stores events many times a second; one notice per second is plenty.
NOTIFY_INTERVAL_SECONDS = 1.0

_subscribers: dict[str, set[asyncio.Queue[None]]] = {}
_last_notified: dict[str, float] = {}
_listener: asyncio.Task | None = None


def _deliver(domain_id: str) -> None:
    for queue in _subscribers.get(domain_id, ()):
        # Size-1 queues: a notice already waiting covers this one too.
        if queue.empty():
            queue.put_nowait(None)


async def notify(domain_id: object) -> None:
    """Signal that `domain_id` has new events. Never raises."""
    key = str(domain_id)
    now = time.monotonic()
    if now - _last_notified.get(key, 0.0) < NOTIFY_INTERVAL_SECONDS:
        return
    _last_notified[key] = now

    client = get_client()
    if client is not None and _listener is not None:
        try:
            # The listener delivers it here as well as on every other instance.
            await client.publish(CHANNEL_PREFIX + key, "1")
            return
        except Exception as exc:
            log.warning(f"Live publish failed, delivering locally: {exc}")
    _deliver(key)


@contextmanager
def subscribe(domain_id: object) -> Iterator[asyncio.Queue[None]]:
    """A queue that receives a `None` whenever the domain has new events."""
    key = str(domain_id)
    queue: asyncio.Queue[None] = asyncio.Queue(maxsize=1)
    _subscribers.setdefault(key, set()).add(queue)
    try:
        yield queue
    finally:
        subscribers = _subscribers.get(key)
        if subscribers is not None:
            subscribers.discard(queue)
            if not subscribers:
                _subscribers.pop(key, None)


async def _listen(pubsub) -> None:
    global _listener
    try:
        async for message in pubsub.listen():
            if message.get("type") == "pmessage":
                _deliver(str(message["channel"]).removeprefix(CHANNEL_PREFIX))
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        # notify() falls back to local delivery once the listener is gone.
        log.warning(f"Live listener stopped: {exc}")
        _listener = None
    finally:
        try:
            await pubsub.aclose()
        except Exception:
            pass


async def start() -> None:
    """Listen for notices from every instance. A no-op without Redis."""
    global _listener
    client = get_client()
    if client is None:
        return
    try:
        pubsub = client.pubsub()
        await pubsub.psubscribe(CHANNEL_PREFIX + "*")
    except Exception as exc:
        log.warning(f"Live pub/sub unavailable, updates stay in this process: {exc}")
        return
    _listener = asyncio.create_task(_listen(pubsub))


async def stop() -> None:
    global _listener
    task, _listener = _listener, None
    if task is not None:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
