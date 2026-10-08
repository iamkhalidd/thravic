"""The performance endpoint returns numbers as JSON numbers.

`avg_cls` was a Postgres numeric (`ROUND(...) / 1000.0`), which the JSON encoder
writes as a string ("0.00200000000000000000"). The dashboard called
`.toFixed(3)` on it and the whole page crashed as soon as a site had CLS data.
"""

from __future__ import annotations

import httpx

from app.main import app
from app.middleware.auth import AuthUser, require_auth
from tests.conftest import requires_test_db

pytestmark = requires_test_db


async def test_web_vitals_are_json_numbers(seeded_domain, db_pool):
    async with db_pool.acquire() as conn:
        owner = await conn.fetchval("SELECT user_id FROM domains WHERE id = $1", seeded_domain)
        for cls, lcp in ((0.001, 1800), (0.003, 2600)):
            await conn.execute(
                "INSERT INTO events (domain_id, type, url, data) VALUES ($1, 'custom', $2, $3)",
                seeded_domain,
                "https://ingest.example.invalid/pricing",
                {"event": "performance", "cls": cls, "lcp": lcp, "fcp": 900, "ttfb": 120},
            )

    app.dependency_overrides[require_auth] = lambda: AuthUser(
        user_id=str(owner), email="owner@example.invalid"
    )
    try:
        # Same event loop as the test's pool (TestClient would run its own).
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            body = (await client.get(f"/api/custom-events/{seeded_domain}/performance")).json()
    finally:
        app.dependency_overrides.clear()

    metrics = body["metrics"]
    assert metrics["avg_cls"] == 0.002
    assert isinstance(metrics["avg_cls"], float)
    assert isinstance(metrics["avg_lcp"], int)
    assert body["byPage"][0]["url"] == "/pricing"
