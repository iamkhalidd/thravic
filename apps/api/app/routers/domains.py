"""Domain routes — port of `routes/domains.ts`."""

from __future__ import annotations

import secrets
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Request

from ..config import get_settings
from ..errors import PayloadError, SimpleError
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.auth import AuthUser, require_auth
from ..plans import PLAN_FEATURES
from ..services import domain_service, plan_service
from ..zod_lite import (
    first_message,
    issue_invalid_type,
    js_type_of,
    string_field,
)

log = create_logger("Domains")

router = APIRouter()

VERIFY_TIMEOUT_SECONDS = 8.0
VERIFY_MAX_BYTES = 512_000
VERIFY_USER_AGENT = "Thravic-Verifier/1.0"

FAILED_LIST = "Failed to list domains"
FAILED_CREATE = "Failed to create domain"
FAILED_GET = "Failed to get domain"
FAILED_SCRIPT = "Failed to get script"
FAILED_VERIFY = "Failed to verify domain"
FAILED_SETTINGS = "Failed to update settings"
FAILED_DELETE = "Failed to delete domain"

# `^[a-zA-Z0-9][a-zA-Z0-9-_.]+[a-zA-Z0-9]$` — note this requires at least three
# characters, so the `.min(3)` below is effectively redundant but is kept so the
# message ordering matches Zod's (min runs before regex).
DOMAIN_PATTERN = r"^[a-zA-Z0-9][a-zA-Z0-9\-_.]+[a-zA-Z0-9]$"

# `updateSettingsSchema` — every key optional. `heatmaps` is still accepted so old
# clients do not get a 400, but it is not stored: heatmaps are built from the click
# and scroll events, which `trackClicks` / `trackScrolls` already control.
SETTINGS_KEYS = (
    "trackClicks",
    "trackScrolls",
    "trackForms",
    "sessionRecording",
    "heatmaps",
)
STORED_SETTINGS = frozenset(domain_service.DEFAULT_SETTINGS)


def generate_tracking_id() -> str:
    """`TF-` + 4 random bytes as uppercase hex."""
    return f"TF-{secrets.token_bytes(4).hex().upper()}"


async def _load_owned_domain(domain_id: str, user_id: str) -> dict[str, Any]:
    """404 unless the user owns the domain or is a member of it."""
    domain = await domain_service.get_by_id(domain_id)
    if not domain or not await domain_service.has_access(domain["id"], user_id):
        raise SimpleError("Domain not found", 404)
    return domain


def _validate_create(body: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    """`createDomainSchema.parse` — returns (values, first error message)."""
    domain, issue = string_field(
        body,
        "domain",
        min_length=3,
        min_message="Domain must be at least 3 characters",
        pattern=DOMAIN_PATTERN,
        pattern_message="Invalid domain format",
    )
    if issue:
        return None, first_message([issue])

    name, issue = string_field(body, "name", required=False, min_length=1)
    if issue:
        return None, first_message([issue])

    return {"domain": domain, "name": name}, None


def _validate_settings(body: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    """`updateSettingsSchema.parse` — all optional booleans."""
    settings: dict[str, Any] = {}
    for key in SETTINGS_KEYS:
        raw = body.get(key)
        if raw is None:
            continue
        if not isinstance(raw, bool):
            issue = issue_invalid_type(key, "boolean", js_type_of(raw))
            return None, first_message([issue])
        settings[key] = raw
    return settings, None


async def _fetch_html(url: str) -> str:
    """Fetch a page, following at most one redirect, capped at 500KB."""
    async with httpx.AsyncClient(
        timeout=VERIFY_TIMEOUT_SECONDS,
        follow_redirects=False,
        headers={"User-Agent": VERIFY_USER_AGENT},
    ) as client:
        response = await client.get(url)
        if response.status_code in (301, 302):
            location = response.headers.get("location")
            if location:
                response = await client.get(location)
        return response.text[:VERIFY_MAX_BYTES]


@router.get("")
@router.get("/")
async def list_domains(user: AuthUser = Depends(require_auth)):
    try:
        domains = await domain_service.list_by_user(user.user_id)

        payload = []
        for domain in domains:
            plan_key = str(domain.get("owner_plan") or "free").lower()
            payload.append(
                {
                    "id": domain["id"],
                    "domain": domain["domain"],
                    "name": domain["name"],
                    "trackingId": domain["tracking_id"],
                    "verified": domain["verified"],
                    "createdAt": domain["created_at"],
                    # Unknown plans fall back to the free feature set
                    "features": PLAN_FEATURES.get(plan_key) or PLAN_FEATURES["free"],
                }
            )
        return jsjson({"domains": payload})
    except Exception as exc:
        log.error(f"List domains error: {exc}")
        raise SimpleError(FAILED_LIST, 500) from None


@router.post("")
@router.post("/")
async def create_domain(request: Request, user: AuthUser = Depends(require_auth)):
    try:
        try:
            body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}

        values, message = _validate_create(body)
        if message is not None:
            # Zod path: body is just `{ error: <first message> }`, no `code`
            raise SimpleError(message, 400)

        # Domains already over the limit (e.g. after a downgrade) are kept; only
        # adding another is refused.
        plan = await plan_service.for_user(user.user_id)
        if await domain_service.count_by_user(user.user_id) >= plan.domains_limit:
            raise PayloadError(
                {
                    "error": f"Your {plan.name} plan allows {plan.domains_limit} "
                    f"domain{'' if plan.domains_limit == 1 else 's'}. "
                    "Upgrade to add more.",
                    "upgrade": True,
                },
                403,
            )

        domain = await domain_service.create(
            user.user_id,
            values["domain"],
            values["name"] or values["domain"],
            generate_tracking_id(),
        )
        if not domain:
            raise SimpleError(FAILED_CREATE, 500)

        return jsjson(
            {
                "id": domain["id"],
                "domain": domain["domain"],
                "name": domain["name"],
                "trackingId": domain["tracking_id"],
                "verified": domain["verified"],
            },
            status_code=201,
        )
    except (PayloadError, SimpleError):
        raise
    except Exception as exc:
        # PostgreSQL unique violation on tracking_id/domain
        if getattr(exc, "sqlstate", None) == "23505":
            raise SimpleError("Domain already added", 400) from None
        log.error(f"Create domain error: {exc}")
        raise SimpleError(FAILED_CREATE, 500) from None


@router.get("/{domainId}/script")
async def get_script(domainId: str, user: AuthUser = Depends(require_auth)):
    try:
        domain = await _load_owned_domain(domainId, user.user_id)

        # NOTE: unlike the OAuth callback builder, this one *does* consult SERVER_URL
        settings = get_settings()
        api_url = settings.SERVER_URL or settings.API_URL or ""
        if not api_url:
            log.warning(
                "SERVER_URL and API_URL env vars are not set — tracking script will "
                "have an empty src URL. Set SERVER_URL to your production backend URL."
            )

        script = (
            "<!-- Thravic Analytics -->\n"
            f'<script async src="{api_url}/tf.js" '
            f'data-tracking-id="{domain["tracking_id"]}"></script>\n'
            "<!-- End Thravic Analytics -->"
        )

        return jsjson(
            {
                "trackingId": domain["tracking_id"],
                "script": script,
                "instructions": [
                    "Copy the script above",
                    "Paste it in the <head> section of your website",
                    "The script will automatically start tracking page views",
                    "Return here to verify the installation",
                ],
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Get script error: {exc}")
        raise SimpleError(FAILED_SCRIPT, 500) from None


@router.post("/{domainId}/verify")
async def verify_domain(domainId: str, user: AuthUser = Depends(require_auth)):
    try:
        domain = await _load_owned_domain(domainId, user.user_id)

        raw_domain = str(domain["domain"]).strip()
        site_url = raw_domain if raw_domain.startswith("http") else f"https://{raw_domain}"

        log.info(
            f"Verifying tracking script on {site_url} for tracking ID {domain['tracking_id']}"
        )

        try:
            html = await _fetch_html(site_url)
        except Exception as fetch_err:
            log.warning(f"Could not fetch {site_url}: {fetch_err}")
            return jsjson(
                {
                    "verified": False,
                    "message": (
                        f"Could not reach your site at {site_url}. Make sure it is "
                        "publicly accessible, then try again."
                    ),
                }
            )

        if domain["tracking_id"] not in html:
            log.info(f"Tracking ID {domain['tracking_id']} NOT found on {site_url}")
            return jsjson(
                {
                    "verified": False,
                    "message": (
                        f"Script not detected on {raw_domain}. Make sure you pasted the "
                        "full snippet inside the <head> tag and redeployed your site."
                    ),
                }
            )

        await domain_service.verify(domain["id"])
        log.info(f"Tracking ID {domain['tracking_id']} verified on {site_url}")

        return jsjson({"verified": True, "message": "Domain verified successfully"})
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Verify domain error: {exc}")
        raise SimpleError(FAILED_VERIFY, 500) from None


@router.patch("/{domainId}/settings")
async def update_settings(
    domainId: str, request: Request, user: AuthUser = Depends(require_auth)
):
    try:
        # The domain check deliberately runs *before* validation, so an
        # inaccessible domain is a 404 rather than a 400.
        await _load_owned_domain(domainId, user.user_id)

        try:
            body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}

        settings, message = _validate_settings(body)
        if message is not None:
            raise SimpleError(message, 400)

        changes = {key: value for key, value in settings.items() if key in STORED_SETTINGS}

        # Recording is a plan feature; switching it on must not bypass the gate.
        if changes.get("sessionRecording"):
            plan = await plan_service.owner_plan(domainId)
            if "recordings" not in plan.features:
                raise PayloadError(
                    {
                        "error": "Session recording requires the pro plan or above.",
                        "upgrade": True,
                    },
                    403,
                )

        domain = await domain_service.update_settings(domainId, changes)
        return jsjson({"settings": domain_service.effective_settings(domain)})
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Update settings error: {exc}")
        raise SimpleError(FAILED_SETTINGS, 500) from None


@router.delete("/{domainId}")
async def delete_domain(domainId: str, user: AuthUser = Depends(require_auth)):
    try:
        domain = await domain_service.get_by_id(domainId)

        # Uses a direct owner comparison rather than hasAccess, so a team member
        # cannot delete the domain.
        if not domain_service.is_owner(domain, user.user_id):
            raise SimpleError("Domain not found", 404)

        await domain_service.remove(domainId)
        return jsjson({"message": "Domain deleted successfully"})
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Delete domain error: {exc}")
        raise SimpleError(FAILED_DELETE, 500) from None


@router.get("/{domainId}")
async def get_domain(domainId: str, user: AuthUser = Depends(require_auth)):
    try:
        domain = await _load_owned_domain(domainId, user.user_id)

        return jsjson(
            {
                "id": domain["id"],
                "domain": domain["domain"],
                "name": domain["name"],
                "trackingId": domain["tracking_id"],
                "verified": domain["verified"],
                "createdAt": domain["created_at"],
                "settings": domain_service.effective_settings(domain),
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Get domain error: {exc}")
        raise SimpleError(FAILED_GET, 500) from None
