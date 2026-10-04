"""The served tracking script — delivery contract for `/tf.js` and `/v.js`.

The body is the esbuild output of `apps/api/tracker/src/index.ts` (committed at
`app/static/tracker.js`). These assertions are deliberately content-light so a
tracker rebuild does not churn the test; they pin the transport contract the
install snippet and browsers depend on: the exact content type and caching
headers, and that the `${apiUrl}` placeholder was interpolated.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import tracker as tracker_routes


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.mark.parametrize("path", ["/tf.js", "/v.js"])
def test_serves_built_tracker_with_the_expected_headers(client, path):
    response = client.get(path)

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/javascript; charset=utf-8"
    # Deliberately short: a rebuilt tracker must reach returning visitors in
    # minutes, not a day. Revalidation is a bodiless 304, so the cost is low.
    assert response.headers["cache-control"] == (
        "public, max-age=300, stale-while-revalidate=86400"
    )
    assert response.headers["access-control-allow-origin"] == "*"
    assert response.headers["etag"]


@pytest.mark.parametrize("path", ["/tf.js", "/v.js"])
def test_tracker_template_is_interpolated_and_self_initialising(client, path):
    body = client.get(path).content

    # The single placeholder must be gone even when SERVER_URL/API_URL are unset
    # (a leftover would ship a literal "${apiUrl}/api/collect" to browsers).
    assert b"${apiUrl}" not in body
    assert b"/api/collect" in body
    # The install snippet passes the id via data-tracking-id; the bootstrap must
    # look for it, or nothing starts on the standard snippet.
    assert b"data-tracking-id" in body


@pytest.mark.parametrize("path", ["/tf.js", "/v.js"])
def test_tracker_bundle_is_never_line_ending_converted(client, path):
    """The payload must stay LF-only, byte for byte.

    `.gitattributes` marks this file `-text` so a Windows checkout cannot rewrite
    it, but the other assertions here would all still pass if it did — they only
    look for substrings. This is the one that notices: the tracker is served
    exactly as it exists on disk, so a CRLF checkout would ship roughly 100 extra
    bytes to every browser and quietly diverge from what was verified.
    """
    body = client.get(path).content

    assert b"\r" not in body, "tracker bundle has CR bytes — check .gitattributes"
    assert b"\n" in body


def test_tf_and_v_js_are_the_same_artifact(client):
    assert client.get("/tf.js").content == client.get("/v.js").content


@pytest.mark.parametrize("path", ["/tf.js", "/v.js"])
def test_revalidation_answers_304_with_no_body(client, path):
    """The point of the ETag: refreshing a 14 KB script costs no body."""
    first = client.get(path)

    second = client.get(path, headers={"if-none-match": first.headers["etag"]})

    assert second.status_code == 304
    assert second.content == b""
    assert second.headers["etag"] == first.headers["etag"]
    assert second.headers["cache-control"] == first.headers["cache-control"]


def test_a_stale_validator_still_gets_the_body(client):
    response = client.get("/tf.js", headers={"if-none-match": '"not-the-current-one"'})

    assert response.status_code == 200
    assert b"/api/collect" in response.content


def test_the_etag_tracks_the_served_bytes(client, monkeypatch):
    """Content-derived: a rebuild must invalidate caches, not keep the old tag."""
    before = client.get("/tf.js").headers["etag"]

    monkeypatch.setattr(tracker_routes, "TRACKER_TEMPLATE", b"// a different build\n")
    monkeypatch.setattr(tracker_routes, "_etag", None)

    assert client.get("/tf.js").headers["etag"] != before
