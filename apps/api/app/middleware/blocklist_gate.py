"""IP and referrer blocklist — port of `middleware/blocklistGate.ts`.

Mounted on every `/api/collect` route in the Express app (`router.use(blocklistGate)`
inside `routes/collect.ts`), so it is a router-level dependency here rather than
global middleware.

Fails open when the settings service is unavailable, matching Express.
"""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import Request

from ..errors import SimpleError
from ..logging import create_logger
from ..services.settings_service import get_setting
from .rate_limit import get_client_ip

log = create_logger("Middleware:Blocklist")


async def blocklist_gate(request: Request) -> None:
    """Reject requests from blocked IPs, or whose referrer matches a blocked host."""
    try:
        client_ip = get_client_ip(request)
        referer = request.headers.get("referer") or ""

        blocked_ips = await get_setting("security.blocked_ips")
        if isinstance(blocked_ips, dict):
            ips = blocked_ips.get("ips")
            if isinstance(ips, list) and client_ip in ips:
                log.warning(f"Blocked IP attempt: {client_ip}")
                raise SimpleError("Access denied", 403)

        blocked_referrers = await get_setting("security.blocked_referrers")
        if isinstance(blocked_referrers, dict) and referer:
            referrers = blocked_referrers.get("referrers")
            if isinstance(referrers, list):
                hostname = urlparse(referer).hostname or ""
                if hostname and any(str(r) in hostname for r in referrers):
                    log.warning(f"Blocked Referrer attempt: {referer}")
                    raise SimpleError("Access denied", 403)

    except SimpleError:
        raise
    except Exception as exc:
        # Fail open if the settings service is down
        log.error(f"Blocklist gate error: {exc}")
