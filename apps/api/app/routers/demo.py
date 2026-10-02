"""Demo routes — port of `routes/demo.ts`.

The whole router is gated at **module load** on `DEMO_MODE === 'true'`. When demo
mode is off, every path under `/api/demo` returns `{"error":"Not found"}` — note
this body has **no `code` field**, unlike the global catch-all 404.

With demo mode on, `POST /seed` creates the demo user, promotes it to Pro, creates
a verified `example.com` domain and generates ~150 visitors of randomised
analytics. That path writes heavily to the database and is only reachable when
`DEMO_MODE=true` is set explicitly.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from random import random
from typing import Any
from urllib.parse import urlparse

import bcrypt
from fastapi import APIRouter
from starlette.responses import Response

from ..config import get_settings
from ..errors import SimpleError
from ..json_response import jsjson
from ..logging import create_logger
from ..services import domain_service, event_service, session_service, user_service

log = create_logger("Demo")

router = APIRouter()

DEMO_EMAIL = "demo@thravic.io"
DEMO_PASSWORD = "demo1234"
DEMO_NAME = "Demo User"

BCRYPT_ROUNDS = 12
TRACKING_ID_PREFIX = "tf_demo_"
VISITOR_COUNT = 150
DEMO_WINDOW_DAYS = 14

SOCIAL_REFERRERS = (
    "https://twitter.com/thravic",
    "https://linkedin.com/company/thravic",
    "https://facebook.com/thravic",
    "https://reddit.com/r/analytics",
    "https://youtube.com/watch?v=demo",
)

SEARCH_REFERRERS = (
    "https://google.com/search?q=analytics+tool",
    "https://bing.com/search?q=website+tracking",
    "https://duckduckgo.com/?q=privacy+analytics",
)

REGULAR_REFERRERS = (
    "https://producthunt.com/posts/thravic",
    "https://hackernews.com/item?id=123456",
    "https://medium.com/analytics-trends",
    "https://techcrunch.com/startups",
    "https://dev.to/thravic",
)

UTM_CAMPAIGNS = (
    {"source": "twitter", "medium": "social", "campaign": "launch2024"},
    {"source": "google", "medium": "cpc", "campaign": "brand-awareness"},
    {"source": "newsletter", "medium": "email", "campaign": "weekly-digest"},
    {"source": "linkedin", "medium": "social", "campaign": "b2b-outreach"},
    {"source": "facebook", "medium": "paid", "campaign": "retargeting"},
)

PAGE_PATHS = (
    "/", "/pricing", "/features", "/about", "/blog", "/docs",
    "/blog/analytics-guide", "/docs/getting-started", "/signup", "/login",
)

DEMO_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
SCREEN_WIDTHS = (1920, 1440, 1366, 1280)
SCREEN_HEIGHTS = (1080, 900, 768, 720)


def _pick(items):
    """`items[Math.floor(Math.random() * items.length)]`."""
    return items[int(random() * len(items))]


def _random_date(days_back: int) -> datetime:
    """Uniformly random instant in the last `days_back` days."""
    now = datetime.now(UTC)
    past = now - timedelta(days=days_back)
    return past + (now - past) * random()


def _host_of(referrer: str) -> str | None:
    parsed = urlparse(referrer)
    return parsed.hostname.replace("www.", "") if parsed.hostname else None


async def _generate_demo_data(domain_id: str) -> None:
    """Randomised sessions and events, written straight to PostgreSQL."""
    for _ in range(VISITOR_COUNT):
        visitor_id = f"demo-v-{secrets.token_hex(4)}"
        session_count = 2 if random() > 0.7 else 1

        for _ in range(session_count):
            session_id = f"demo-s-{secrets.token_hex(4)}"

            roll = random()
            referrer: str | None = None
            utm: dict | None = None

            if roll < 0.25:
                pass  # direct
            elif roll < 0.45:
                referrer = _pick(SEARCH_REFERRERS)
            elif roll < 0.60:
                referrer = _pick(SOCIAL_REFERRERS)
            elif roll < 0.75:
                referrer = _pick(REGULAR_REFERRERS)
            elif roll < 0.90:
                utm = _pick(UTM_CAMPAIGNS)
            else:
                utm = {
                    "source": "newsletter",
                    "medium": "email",
                    "campaign": "weekly-digest",
                }

            source_type = session_service.classify_source(
                referrer, utm["medium"] if utm else None
            )

            await session_service.upsert(
                {
                    "sessionId": session_id,
                    "domainId": domain_id,
                    "visitorId": visitor_id,
                    "source": _host_of(referrer)
                    if referrer
                    else (utm["source"] if utm else None),
                    "sourceType": source_type,
                    "referrer": referrer,
                    "utmSource": utm["source"] if utm else None,
                    "utmMedium": utm["medium"] if utm else None,
                    "utmCampaign": utm["campaign"] if utm else None,
                    "userAgent": DEMO_USER_AGENT,
                    "screenWidth": _pick(SCREEN_WIDTHS),
                    "screenHeight": _pick(SCREEN_HEIGHTS),
                    "language": "en-US",
                }
            )

            batch: list[dict[str, Any]] = []
            for _ in range(int(random() * 5) + 1):
                batch.append(
                    {
                        "domainId": domain_id,
                        "sessionId": session_id,
                        "visitorId": visitor_id,
                        "type": "pageview",
                        "url": f"https://example.com{_pick(PAGE_PATHS)}",
                        "referrer": referrer,
                        "utmSource": utm["source"] if utm else None,
                        "utmMedium": utm["medium"] if utm else None,
                        "utmCampaign": utm["campaign"] if utm else None,
                        "data": {},
                    }
                )

            if random() > 0.5:
                batch.append(
                    {
                        "domainId": domain_id,
                        "sessionId": session_id,
                        "visitorId": visitor_id,
                        "type": "click",
                        "url": f"https://example.com{_pick(PAGE_PATHS)}",
                        "referrer": referrer,
                        "utmSource": utm["source"] if utm else None,
                        "utmMedium": utm["medium"] if utm else None,
                        "utmCampaign": utm["campaign"] if utm else None,
                        "data": {"element": "button.cta", "x": 500, "y": 300},
                    }
                )

            await event_service.batch_insert(batch)


if not get_settings().demo_enabled:

    @router.api_route(
        "", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]
    )
    @router.api_route(
        "/{path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    )
    async def demo_disabled(path: str = "") -> Response:
        # Bare `{"error": "Not found"}` — deliberately without the `code` field
        # that the global 404 handler adds.
        return jsjson({"error": "Not found"}, status_code=404)

else:

    @router.post("/seed")
    async def seed():
        try:
            hashed = bcrypt.hashpw(
                DEMO_PASSWORD.encode("utf-8")[:72], bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
            ).decode("utf-8")

            user = await user_service.create_user(DEMO_EMAIL, hashed, DEMO_NAME)
            if not user:
                raise SimpleError("Failed to seed demo data", 500)

            await user_service.update_subscription(user["id"], "pro")

            domain = await domain_service.create(
                user["id"],
                "example.com",
                "Demo Website",
                f"{TRACKING_ID_PREFIX}{secrets.token_hex(4)}",
            )
            await domain_service.verify(domain["id"])

            await _generate_demo_data(domain["id"])

            return jsjson(
                {
                    "success": True,
                    "message": "Demo data seeded successfully!",
                    "credentials": {"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
                }
            )
        except SimpleError:
            raise
        except Exception as exc:
            log.error(f"Demo seed error: {exc}")
            raise SimpleError("Failed to seed demo data", 500) from None

    @router.get("/credentials")
    async def credentials():
        return jsjson(
            {
                "email": DEMO_EMAIL,
                "password": DEMO_PASSWORD,
                "note": "Use these credentials to log in and explore the dashboard",
            }
        )
