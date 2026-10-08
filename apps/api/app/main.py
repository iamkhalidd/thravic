"""FastAPI application — port of the Express `index.ts` wiring.

Middleware order matches Express. Starlette treats the *last* middleware added as
outermost, so the calls below are reversed relative to the Express `app.use()`
order to land on the same stack:

    security headers -> CORS -> rate limiting -> maintenance -> routes
"""

from __future__ import annotations

import time
import traceback
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .db import close_database, init_database
from .jobs import init_jobs, shutdown_jobs
from .json_response import js_iso_datetime, jsjson
from .logging import configure_logging, create_logger
from .middleware.cors import ThravicCORSMiddleware
from .middleware.error_handler import register_exception_handlers
from .middleware.profile_gate import profile_gate
from .middleware.rate_limit import RateLimitMiddleware
from .middleware.security_headers import SecurityHeadersMiddleware
from .middleware.settings_gate import MaintenanceModeMiddleware
from .redis_client import close_redis, init_redis
from .routers import admin as admin_routes
from .routers import analytics as analytics_routes
from .routers import announcements as announcement_routes
from .routers import auth as auth_routes
from .routers import collect as collect_routes
from .routers import contact as contact_routes
from .routers import custom_events as custom_event_routes
from .routers import demo as demo_routes
from .routers import domains as domain_routes
from .routers import experiments as experiment_routes
from .routers import export as export_routes
from .routers import funnels as funnel_routes
from .routers import heatmaps as heatmap_routes
from .routers import insights as insight_routes
from .routers import payments as payment_routes
from .routers import recordings as recording_routes
from .routers import sources as source_routes
from .routers import team as team_routes
from .routers import tracker as tracker_routes
from .routers import webhooks as webhook_routes
from .security import validate_cors_origins, validate_security_config
from .services.email_service import send_email_or_raise

log = create_logger("Server")

settings = get_settings()

_started_at = time.time()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Mirror the Express `start()` sequence."""
    configure_logging()

    # Fails fast in production when secrets/origins are insecure
    validate_security_config()
    validate_cors_origins(settings.allowed_origins)

    # Scheduled jobs. Express calls initJobs() before the database is up, which is
    # fine there because the cron handler only touches the DB when it fires.
    scheduler = init_jobs()

    # Database is required — routes will fail without it
    await init_database()

    # Redis is optional — caching degrades gracefully. Collection itself writes
    # straight to Postgres, so nothing depends on Redis being up.
    await init_redis()

    log.info(f"Thravic API ready on port {settings.PORT}")
    yield

    shutdown_jobs(scheduler)

    await close_redis()
    await close_database()
    log.info("Shutdown complete")


# Swagger/OpenAPI is served by default; set DOCS_ENABLED=false to hide it.
_docs_enabled = settings.DOCS_ENABLED

app = FastAPI(
    title="Thravic API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if _docs_enabled else None,
    redoc_url=None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

register_exception_handlers(app)

# Innermost first — see the module docstring for why this order is reversed.
app.add_middleware(MaintenanceModeMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(ThravicCORSMiddleware, allowed_origins=settings.allowed_origins)
app.add_middleware(SecurityHeadersMiddleware, allowed_origins=settings.allowed_origins)


# ── Health ───────────────────────────────────────────────────────────────────
# Registered before the maintenance gate (which explicitly allows /health), so it
# stays reachable during maintenance — same as Express.
@app.get("/health")
async def health():
    return jsjson(
        {
            "status": "ok",
            "timestamp": datetime.now(UTC),
            "uptime": time.time() - _started_at,
            "environment": settings.NODE_ENV or "development",
        }
    )


# ── Static uploads ───────────────────────────────────────────────────────────
# Express serves `process.cwd()/uploads`; the directory is created on boot so the
# mount never fails on a fresh checkout.
_upload_dir = Path.cwd() / "uploads"
_upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_upload_dir)), name="uploads")


# ── Routes ───────────────────────────────────────────────────────────────────
# Dashboard data needs a complete profile (and an unrestricted account).
PROFILE_REQUIRED = [Depends(profile_gate)]
app.include_router(auth_routes.router, prefix="/api/auth", tags=["auth"])
app.include_router(
    analytics_routes.router, prefix="/api/analytics", tags=["analytics"],
    dependencies=PROFILE_REQUIRED,
)
app.include_router(
    source_routes.router, prefix="/api/sources", tags=["sources"],
    dependencies=PROFILE_REQUIRED,
)
app.include_router(
    heatmap_routes.router, prefix="/api/heatmaps", tags=["heatmaps"],
    dependencies=PROFILE_REQUIRED,
)
app.include_router(
    insight_routes.router, prefix="/api/insights", tags=["insights"],
    dependencies=PROFILE_REQUIRED,
)
app.include_router(
    custom_event_routes.router, prefix="/api/custom-events", tags=["custom-events"],
    dependencies=PROFILE_REQUIRED,
)
app.include_router(
    announcement_routes.router, prefix="/api/announcements", tags=["announcements"]
)
app.include_router(contact_routes.router, prefix="/api/contact", tags=["contact"])
app.include_router(
    domain_routes.router, prefix="/api/domains", tags=["domains"],
    dependencies=PROFILE_REQUIRED,
)
app.include_router(
    funnel_routes.router, prefix="/api/funnels", tags=["funnels"],
    dependencies=PROFILE_REQUIRED,
)
app.include_router(
    recording_routes.router, prefix="/api/recordings", tags=["recordings"],
    dependencies=PROFILE_REQUIRED,
)
app.include_router(
    experiment_routes.router, prefix="/api/experiments", tags=["experiments"],
    dependencies=PROFILE_REQUIRED,
)
app.include_router(
    webhook_routes.router, prefix="/api/webhooks", tags=["webhooks"],
    dependencies=PROFILE_REQUIRED,
)
app.include_router(
    team_routes.router, prefix="/api/teams", tags=["teams"],
    dependencies=PROFILE_REQUIRED,
)
app.include_router(
    export_routes.router, prefix="/api/export", tags=["export"],
    dependencies=PROFILE_REQUIRED,
)
app.include_router(demo_routes.router, prefix="/api/demo", tags=["demo"])
app.include_router(collect_routes.router, prefix="/api/collect", tags=["collect"])
app.include_router(payment_routes.router, prefix="/api/payments", tags=["payments"])
app.include_router(admin_routes.router, prefix="/api/admin", tags=["admin"])
# Served from the root, like the `app.get(['/tf.js', '/v.js'])` handler in index.ts
app.include_router(tracker_routes.router, tags=["tracker"])


# ── Email diagnostic ─────────────────────────────────────────────────────────
# Port of the `app.get('/api/test-email')` handler at the bottom of index.ts.
# Unlike every other email call site, this one sees provider failures (Express's
# `sendEmail` throws), so it uses the raising variant and answers 500 with the
# error and stack, exactly as Express did.
@app.get("/api/test-email")
async def test_email(request: Request):
    to = request.query_params.get("to") or settings.SMTP_USER or ""
    if not to:
        return jsjson(
            {"error": "No recipient — set ?to=email or SMTP_USER env"}, status_code=400
        )

    now = js_iso_datetime(datetime.now(UTC))
    try:
        await send_email_or_raise(
            to,
            "🧪 Thravic Test Email",
            '<div style="font-family:sans-serif;padding:20px;"><h2>✅ SMTP is working!</h2>'
            f"<p>Sent at: {now}</p><p>Server: {settings.SERVER_URL or 'localhost'}</p></div>",
            f"This is a test email from Thravic at {now}. If you see this, SMTP is working!",
        )
        return jsjson({"ok": True, "message": f"Test email sent to {to}"})
    except Exception as error:
        return jsjson(
            {"ok": False, "error": str(error), "stack": traceback.format_exc()},
            status_code=500,
        )
