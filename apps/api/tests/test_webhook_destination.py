"""Webhook destinations — the server makes the request, so it must not be aimed inward.

Without a check, saving `http://169.254.169.254/...` as a webhook would make the
API post visitor events to the cloud metadata service (SSRF); `localhost` and
private ranges reach internal services the same way.
"""

from __future__ import annotations

import pytest

from app.services.webhook_service import destination_error


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:8080/hook",
        "http://127.0.0.1/hook",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.5/hook",
        "http://192.168.1.10/hook",
        "http://172.16.0.1/hook",
        "http://100.64.0.1/hook",  # carrier-grade NAT
        "http://[::1]/hook",
        "http://[::ffff:127.0.0.1]/hook",  # IPv4-mapped loopback
        "http://0.0.0.0/hook",
    ],
)
async def test_internal_destinations_are_refused(url):
    assert await destination_error(url) == "Webhook URL must point to a public internet address"


@pytest.mark.parametrize("url", ["ftp://example.com/hook", "file:///etc/passwd", "not a url"])
async def test_non_http_urls_are_refused(url):
    assert await destination_error(url) == "Webhook URL must be an http(s) URL"


async def test_unresolvable_hosts_are_refused():
    assert await destination_error("https://does-not-exist.invalid/hook") == (
        "Webhook URL host could not be resolved"
    )


async def test_public_addresses_are_allowed():
    assert await destination_error("https://93.184.216.34/hook") is None
