"""GeoIP lookup — port of `services/geoService.ts`.

⚠️ `geoip-lite` is **not installed** in the Express deployment (it logs
"[Geo] geoip-lite not found. Geo tracking will be disabled." on boot), so
`checkIp` returns `null` for every address, including localhost. The port
reproduces that: `GEOIP_AVAILABLE` is False until a geo database is actually
bundled, which keeps the two backends identical.

If geo data is added later, it must be added to **both** backends, or the
`country`/`region`/`city` columns will start diverging.
"""

from __future__ import annotations

from typing import Any

from ..logging import create_logger

log = create_logger("Geo")

# Set to True only once a geo database is shipped on both sides.
GEOIP_AVAILABLE = False

LOCALHOST_ADDRESSES = frozenset({"127.0.0.1", "::1"})


def check_ip(ip: str) -> dict[str, Any] | None:
    """Resolve an IP to a location, or None when geo lookup is unavailable."""
    if not GEOIP_AVAILABLE or not ip:
        return None

    try:
        # Private/loopback addresses are special-cased before the lookup, exactly
        # as in Express (`country: 'LO'`, a non-ISO placeholder).
        if ip in LOCALHOST_ADDRESSES:
            return {"country": "LO", "city": "Localhost"}

        # A real implementation would consult the bundled geo database here.
        return None
    except Exception as exc:
        log.error(f"[Geo] Lookup failed: {exc}")
        return None
