"""Announcement route — port of `routes/announcements.ts`."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter

from ..json_response import jsjson
from ..services.settings_service import get_setting, is_enabled

router = APIRouter()


@router.get("/active")
async def active() -> Any:
    try:
        enabled = await is_enabled("announcement.enabled")
        if not enabled:
            return jsjson({"announcement": None})

        message, severity = await asyncio.gather(
            get_setting("announcement.message"),
            get_setting("announcement.severity"),
        )

        if not message:
            return jsjson({"announcement": None})

        return jsjson(
            {
                "announcement": {
                    "message": message,
                    # `severity ?? 'info'` — only null/undefined fall back
                    "severity": severity if severity is not None else "info",
                }
            }
        )
    except Exception:
        # Fail silently — never break the customer dashboard over an announcement
        return jsjson({"announcement": None})
