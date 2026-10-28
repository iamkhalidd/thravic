"""The Agency plan's toolkit: the agency's brand, client share links and report settings.

* **Brand** — one per user: a name, a colour, an optional logo and whether client
  reports and links say "powered by Thravic". Reports for a site use its owner's brand.
* **Share links** — read-only links to one site. The token is random (256 bits),
  shown once, and only its SHA-256 is stored, so a database leak gives no working
  links. A link stops working when revoked, when it expires, or when the owner's
  plan no longer includes ``client_links``.
* **Report settings** — whether a site's monthly client report goes out, and to whom.
"""

from __future__ import annotations

import hashlib
import io
import re
import secrets
from datetime import datetime, timedelta
from typing import Any

from ..db import query, query_one
from . import plan_service

LINK_FEATURE = "client_links"
REPORT_FEATURE = "client_reports"
OVERVIEW_FEATURE = "client_overview"

TOKEN_BYTES = 32
# token_urlsafe(32) is 43 characters; anything else is not one of ours.
TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{43}$")
MAX_LINKS_PER_SITE = 20
MAX_EXPIRY_DAYS = 365

COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")
DEFAULT_COLOR = "#111827"
MAX_NAME = 80
MAX_LOGO_BYTES = 512 * 1024
LOGO_BOX = (600, 200)  # the stored logo fits inside this, in pixels
LOGO_TYPES = frozenset({"PNG", "JPEG", "WEBP", "GIF"})

MAX_RECIPIENTS = 10
EMAIL_PATTERN = re.compile(r"^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$")


# ── Brand ────────────────────────────────────────────────────────────────────


def default_brand() -> dict[str, Any]:
    return {
        "name": "",
        "color": DEFAULT_COLOR,
        "logo": None,
        "logoKey": None,
        "showPoweredBy": True,
    }


def _brand(row: dict[str, Any] | None) -> dict[str, Any]:
    if not row:
        return default_brand()
    return {
        "name": row["name"] or "",
        "color": row["color"] or DEFAULT_COLOR,
        "logo": bytes(row["logo"]) if row.get("logo") else None,
        "logoKey": row["logo_key"],
        "showPoweredBy": bool(row["show_powered_by"]),
    }


async def get_brand(user_id: Any) -> dict[str, Any]:
    """The user's brand, with the logo bytes (for PDFs); defaults when none is saved."""
    return _brand(await query_one("SELECT * FROM agency_brands WHERE user_id = $1", user_id))


def public_brand(brand: dict[str, Any], logo_base_url: str) -> dict[str, Any]:
    """The brand as the dashboard and share pages see it (a logo URL, not bytes)."""
    key = brand.get("logoKey")
    return {
        "name": brand["name"],
        "color": brand["color"],
        "logoUrl": f"{logo_base_url}/api/share/brand-logo/{key}" if key else None,
        "showPoweredBy": brand["showPoweredBy"],
    }


def brand_error(body: dict[str, Any]) -> str | None:
    """Why this brand update can't be saved, if it can't."""
    name = body.get("name")
    if name is not None and (not isinstance(name, str) or len(name.strip()) > MAX_NAME):
        return f"name must be text of at most {MAX_NAME} characters"
    color = body.get("color")
    if color is not None and (not isinstance(color, str) or not COLOR_PATTERN.match(color)):
        return "color must be a hex colour like #1a73e8"
    powered = body.get("showPoweredBy")
    if powered is not None and not isinstance(powered, bool):
        return "showPoweredBy must be true or false"
    return None


async def save_brand(user_id: Any, body: dict[str, Any]) -> dict[str, Any]:
    current = await get_brand(user_id)
    name = body["name"].strip() if isinstance(body.get("name"), str) else current["name"]
    color = body.get("color") or current["color"]
    powered = body["showPoweredBy"] if "showPoweredBy" in body else current["showPoweredBy"]
    row = await query_one(
        """
        INSERT INTO agency_brands (user_id, name, color, show_powered_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE
        SET name = EXCLUDED.name, color = EXCLUDED.color,
            show_powered_by = EXCLUDED.show_powered_by, updated_at = NOW()
        RETURNING *
        """,
        user_id,
        name,
        color.lower(),
        powered,
    )
    return _brand(row)


def normalise_logo(data: bytes) -> bytes:
    """The upload as a PNG that fits `LOGO_BOX`; ValueError if it isn't a usable image.

    Re-encoding keeps only pixels, so nothing else in the file (metadata, scripts
    in an SVG pretending to be a PNG) is ever served back.
    """
    from PIL import Image  # installed with fpdf2

    if not data or len(data) > MAX_LOGO_BYTES:
        raise ValueError(f"The logo must be an image under {MAX_LOGO_BYTES // 1024} KB")
    try:
        with Image.open(io.BytesIO(data)) as img:
            if img.format not in LOGO_TYPES:
                raise ValueError("Upload a PNG, JPEG, WebP or GIF logo")
            img.load()
            img = img.convert("RGBA")
            img.thumbnail(LOGO_BOX)
            out = io.BytesIO()
            img.save(out, format="PNG", optimize=True)
            return out.getvalue()
    except ValueError:
        raise
    except Exception as exc:  # noqa: BLE001 — Pillow raises many kinds for bad files
        raise ValueError("That file isn't an image we can read") from exc


async def save_logo(user_id: Any, png: bytes) -> dict[str, Any]:
    row = await query_one(
        """
        INSERT INTO agency_brands (user_id, logo, logo_key) VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE
        SET logo = EXCLUDED.logo, logo_key = EXCLUDED.logo_key, updated_at = NOW()
        RETURNING *
        """,
        user_id,
        png,
        secrets.token_hex(16),
    )
    return _brand(row)


async def remove_logo(user_id: Any) -> dict[str, Any]:
    row = await query_one(
        "UPDATE agency_brands SET logo = NULL, logo_key = NULL, updated_at = NOW() "
        "WHERE user_id = $1 RETURNING *",
        user_id,
    )
    return _brand(row)


async def logo_by_key(key: str) -> bytes | None:
    if not re.fullmatch(r"[0-9a-f]{32}", key or ""):
        return None
    row = await query_one("SELECT logo FROM agency_brands WHERE logo_key = $1", key)
    return bytes(row["logo"]) if row and row["logo"] else None


# ── Share links ──────────────────────────────────────────────────────────────


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_token() -> tuple[str, str]:
    """`(token, sha256 hex)`; only the hash is stored."""
    token = secrets.token_urlsafe(TOKEN_BYTES)
    return token, hash_token(token)


def looks_like_token(token: str) -> bool:
    return bool(TOKEN_PATTERN.match(token or ""))


def link_state(link: dict[str, Any], now: datetime) -> str:
    """'active', 'revoked' or 'expired'."""
    if link.get("revoked_at"):
        return "revoked"
    expires = link.get("expires_at")
    if expires is not None and expires <= now:
        return "expired"
    return "active"


def expiry_error(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= MAX_EXPIRY_DAYS:
        return f"expiresInDays must be a whole number from 1 to {MAX_EXPIRY_DAYS}, or empty"
    return None


def public_link(link: dict[str, Any], now: datetime) -> dict[str, Any]:
    return {
        "id": str(link["id"]),
        "label": link["label"],
        "allowRecordings": link["allow_recordings"],
        "expiresAt": link["expires_at"],
        "revokedAt": link["revoked_at"],
        "createdAt": link["created_at"],
        "lastUsedAt": link["last_used_at"],
        "state": link_state(link, now),
    }


async def list_links(domain_id: str) -> list[dict[str, Any]]:
    return await query(
        "SELECT * FROM share_links WHERE domain_id = $1 ORDER BY created_at DESC", domain_id
    )


async def create_link(
    domain_id: str,
    user_id: str,
    label: str,
    allow_recordings: bool,
    expires_in_days: int | None,
    now: datetime,
) -> tuple[str, dict[str, Any]]:
    """The new link's token (shown once) and its row."""
    token, digest = new_token()
    expires = now + timedelta(days=expires_in_days) if expires_in_days else None
    row = await query_one(
        """
        INSERT INTO share_links (domain_id, token_hash, label, allow_recordings, expires_at,
                                 created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        """,
        domain_id,
        digest,
        label,
        allow_recordings,
        expires,
        user_id,
    )
    return token, row


async def active_link_count(domain_id: str) -> int:
    row = await query_one(
        "SELECT COUNT(*)::int AS n FROM share_links WHERE domain_id = $1 AND revoked_at IS NULL "
        "AND (expires_at IS NULL OR expires_at > NOW())",
        domain_id,
    )
    return int((row or {}).get("n") or 0)


async def revoke_link(domain_id: str, link_id: str) -> bool:
    """Revoke one of this site's links; False if the site has no such link."""
    row = await query_one(
        "UPDATE share_links SET revoked_at = COALESCE(revoked_at, NOW()) "
        "WHERE id = $1 AND domain_id = $2 RETURNING id",
        link_id,
        domain_id,
    )
    return row is not None


async def resolve_link(token: str, now: datetime) -> dict[str, Any] | None:
    """The working link for `token` with its site, or None.

    Everything a share page shows is read through the returned row's
    ``domain_id``, never from the request, so a link reaches one site only.
    """
    if not looks_like_token(token):
        return None
    link = await query_one(
        """
        SELECT l.*, d.domain, d.name AS site_name, d.user_id AS owner_id
        FROM share_links l JOIN domains d ON d.id = l.domain_id
        WHERE l.token_hash = $1
        """,
        hash_token(token),
    )
    if not link or link_state(link, now) != "active":
        return None
    plan = await plan_service.for_user(str(link["owner_id"]))
    if LINK_FEATURE not in plan.features:
        return None
    if not link["last_used_at"] or now - link["last_used_at"] > timedelta(minutes=10):
        await query(
            "UPDATE share_links SET last_used_at = $2 WHERE id = $1 RETURNING 1", link["id"], now
        )
    return link


# ── Report settings ──────────────────────────────────────────────────────────


def clean_recipients(value: Any) -> tuple[list[str], str | None]:
    """`(addresses, error)` from a list of emails; duplicates dropped, case-folded."""
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        return [], "recipients must be a list of email addresses"
    seen: list[str] = []
    for raw in value:
        email = raw.strip().lower()
        if not email:
            continue
        if not EMAIL_PATTERN.match(email) or len(email) > 254:
            return [], f"{raw.strip()!r} is not an email address"
        if email not in seen:
            seen.append(email)
    if len(seen) > MAX_RECIPIENTS:
        return [], f"Up to {MAX_RECIPIENTS} recipients per site"
    return seen, None


async def get_report_settings(domain_id: str) -> dict[str, Any]:
    row = await query_one(
        "SELECT enabled, recipients FROM client_report_settings WHERE domain_id = $1", domain_id
    )
    return {
        "enabled": bool(row and row["enabled"]),
        "recipients": list(row["recipients"]) if row else [],
    }


async def save_report_settings(domain_id: str, enabled: bool, recipients: list[str]) -> None:
    await query(
        """
        INSERT INTO client_report_settings (domain_id, enabled, recipients) VALUES ($1, $2, $3)
        ON CONFLICT (domain_id) DO UPDATE
        SET enabled = EXCLUDED.enabled, recipients = EXCLUDED.recipients, updated_at = NOW()
        RETURNING 1
        """,
        domain_id,
        enabled,
        recipients,
    )


async def latest_report(domain_id: str) -> dict[str, Any] | None:
    return await query_one(
        "SELECT * FROM client_reports WHERE domain_id = $1 ORDER BY sent_at DESC LIMIT 1",
        domain_id,
    )


async def recent_reports(domain_id: str, limit: int = 6) -> list[dict[str, Any]]:
    return await query(
        "SELECT id, period_key, trigger, recipients, sent_at FROM client_reports "
        "WHERE domain_id = $1 ORDER BY sent_at DESC LIMIT $2",
        domain_id,
        limit,
    )
