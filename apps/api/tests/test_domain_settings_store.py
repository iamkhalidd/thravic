"""Domain settings are stored as overrides and merged — Postgres round-trip.

Skipped unless `THRAVIC_TEST_DATABASE_URL` is set.
"""

from __future__ import annotations

from app.services import domain_service
from tests.conftest import requires_test_db

pytestmark = requires_test_db


async def test_updates_merge_into_the_stored_overrides(seeded_domain, db_pool):
    await domain_service.update_settings(seeded_domain, {"trackClicks": False})
    domain = await domain_service.update_settings(seeded_domain, {"sessionRecording": True})

    assert domain["settings"] == {"trackClicks": False, "sessionRecording": True}
    assert domain_service.effective_settings(domain) == {
        "trackClicks": False,
        "trackScrolls": True,
        "trackForms": True,
        "sessionRecording": True,
    }


async def test_a_new_domain_has_the_defaults(seeded_domain, db_pool):
    domain = await domain_service.get_by_id(seeded_domain)

    assert domain_service.effective_settings(domain) == domain_service.DEFAULT_SETTINGS
