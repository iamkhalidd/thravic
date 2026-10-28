"""Agency toolkit: share-link tokens, plan gating, the client report, and isolation.

The share-link tests pin the boundary that matters: a link resolves to one site,
and every public route reads through that site only, whatever the request says.
The database is stood in for, so each test can see exactly which site was read.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.middleware import feature_gate
from app.middleware.auth import AuthUser, require_auth
from app.plans import PLAN_FEATURES
from app.routers import agency, share
from app.services import agency_service, client_report_service

NOW = datetime(2026, 10, 28, 12, tzinfo=UTC)
OWNER = "11111111-1111-4111-8111-111111111111"
SITE_A = "33333333-3333-4333-8333-333333333333"
SITE_B = "44444444-4444-4444-8444-444444444444"
AGENCY_FEATURES = ("client_reports", "client_links", "client_overview")


# ── Tokens ───────────────────────────────────────────────────────────────────


def test_new_token_is_long_random_and_only_its_hash_is_kept():
    token, digest = agency_service.new_token()
    other, _ = agency_service.new_token()
    assert token != other
    assert len(token) == 43 and agency_service.looks_like_token(token)
    assert digest == hashlib.sha256(token.encode()).hexdigest() == agency_service.hash_token(token)
    assert token not in digest


@pytest.mark.parametrize("bad", ["", "abc", "x" * 42, "x" * 44, "a/b" + "c" * 40, "../" * 15])
def test_malformed_tokens_are_rejected_before_any_lookup(bad):
    assert not agency_service.looks_like_token(bad)


def test_link_state():
    live = {"revoked_at": None, "expires_at": None}
    assert agency_service.link_state(live, NOW) == "active"
    assert agency_service.link_state({**live, "expires_at": NOW + timedelta(days=1)}, NOW) == (
        "active"
    )
    assert agency_service.link_state({**live, "expires_at": NOW}, NOW) == "expired"
    assert agency_service.link_state({**live, "revoked_at": NOW}, NOW) == "revoked"


@pytest.mark.parametrize("value", [0, 366, -1, 1.5, "30", True])
def test_expiry_must_be_whole_days_within_a_year(value):
    assert agency_service.expiry_error(value)


@pytest.mark.parametrize("value", [None, 1, 30, 365])
def test_expiry_accepts_empty_or_whole_days(value):
    assert agency_service.expiry_error(value) is None


def _link_row(token, **extra):
    return {
        "id": "55555555-5555-4555-8555-555555555555",
        "domain_id": SITE_A,
        "token_hash": agency_service.hash_token(token),
        "label": "Acme",
        "allow_recordings": False,
        "expires_at": None,
        "revoked_at": None,
        "last_used_at": NOW,
        "created_at": NOW,
        "domain": "acme.com",
        "site_name": "Acme",
        "owner_id": OWNER,
        **extra,
    }


@pytest.fixture
def links(monkeypatch):
    """A one-row share_links table keyed by token hash, and the owner's plan."""
    state = {"rows": {}, "plan": "agency", "lookups": 0}

    async def query_one(sql, *args):
        if "FROM share_links l JOIN domains" in sql:
            state["lookups"] += 1
            return state["rows"].get(args[0])
        raise AssertionError(sql)

    async def query(sql, *args):
        return []

    async def for_user(user_id):
        return SimpleNamespace(features=PLAN_FEATURES[state["plan"]])

    monkeypatch.setattr(agency_service, "query_one", query_one)
    monkeypatch.setattr(agency_service, "query", query)
    monkeypatch.setattr(agency_service.plan_service, "for_user", for_user)

    def add(**extra):
        token, _ = agency_service.new_token()
        row = _link_row(token, **extra)
        state["rows"][row["token_hash"]] = row
        return token

    state["add"] = add
    return state


async def test_resolve_link_finds_a_working_link(links):
    token = links["add"]()
    link = await agency_service.resolve_link(token, NOW)
    assert link["domain_id"] == SITE_A


async def test_resolve_link_refuses_revoked_expired_and_unknown(links):
    revoked = links["add"](revoked_at=NOW - timedelta(minutes=1))
    expired = links["add"](expires_at=NOW - timedelta(seconds=1))
    unknown, _ = agency_service.new_token()
    for token in (revoked, expired, unknown):
        assert await agency_service.resolve_link(token, NOW) is None


async def test_resolve_link_skips_the_lookup_for_malformed_tokens(links):
    assert await agency_service.resolve_link("not-a-token", NOW) is None
    assert links["lookups"] == 0


async def test_links_stop_working_when_the_agency_leaves_the_plan(links):
    token = links["add"]()
    links["plan"] = "pro"
    assert await agency_service.resolve_link(token, NOW) is None


async def test_revoke_is_scoped_to_the_site(monkeypatch):
    seen = {}

    async def query_one(sql, *args):
        seen["sql"], seen["args"] = sql, args
        return None

    monkeypatch.setattr(agency_service, "query_one", query_one)
    assert await agency_service.revoke_link(SITE_B, "link-of-site-a") is False
    assert "domain_id = $2" in seen["sql"]
    assert seen["args"] == ("link-of-site-a", SITE_B)


# ── Plan gating ──────────────────────────────────────────────────────────────


def test_only_the_agency_plan_has_the_toolkit():
    for feature in AGENCY_FEATURES:
        assert feature in PLAN_FEATURES["agency"]
        for plan in ("free", "pro", "business"):
            if plan in PLAN_FEATURES:
                assert feature not in PLAN_FEATURES[plan]


@pytest.fixture
def signed_in():
    app.dependency_overrides[require_auth] = lambda: AuthUser(user_id=OWNER, email="a@b.co")
    yield TestClient(app)
    app.dependency_overrides.pop(require_auth, None)


@pytest.fixture
def plan(monkeypatch):
    """Put the signed-in user on a chosen plan, as the feature gate sees it."""
    chosen = {"plan": "pro"}

    async def query_one(sql, *args):
        if "SELECT user_id FROM domains" in sql:
            return {"user_id": OWNER}
        return {"plan": chosen["plan"]}

    async def get(name):
        return SimpleNamespace(features=PLAN_FEATURES[name])

    async def lowest_plan_with(feature):
        return "agency"

    monkeypatch.setattr(feature_gate, "get_settings",
                        lambda: SimpleNamespace(DATABASE_URL="postgres://test", is_production=True))
    monkeypatch.setattr(feature_gate, "query_one", query_one)
    monkeypatch.setattr(feature_gate.plan_catalog, "get", get)
    monkeypatch.setattr(feature_gate.plan_catalog, "lowest_plan_with", lowest_plan_with)
    return chosen


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/agency/overview"),
        ("get", "/api/agency/branding"),
        ("get", f"/api/agency/reports/{SITE_A}"),
        ("post", f"/api/agency/reports/{SITE_A}/send"),
        ("get", f"/api/agency/links/{SITE_A}"),
        ("post", f"/api/agency/links/{SITE_A}"),
    ],
)
@pytest.mark.parametrize("current", ["free", "pro"])
def test_toolkit_routes_need_the_agency_plan(signed_in, plan, method, path, current):
    plan["plan"] = current
    response = getattr(signed_in, method)(path)
    assert response.status_code == 403
    body = response.json()
    assert body["upgrade"] is True and body["requiredPlan"] == "agency"


def test_agency_plan_passes_the_gate_but_not_someone_elses_site(signed_in, plan, monkeypatch):
    plan["plan"] = "agency"

    async def query_one(sql, *args):
        return None  # the user neither owns nor administers this site

    monkeypatch.setattr(agency, "query_one", query_one)
    response = signed_in.get(f"/api/agency/links/{SITE_B}")
    assert response.status_code == 403


# ── Share links can't reach other sites ──────────────────────────────────────


@pytest.fixture
def public(monkeypatch):
    """Share routes with a resolved link for site A; records every site read."""
    state = {"link": _link_row("t"), "reads": []}

    async def resolve_link(token, now):
        return state["link"] if token == "good" else None

    def recorder(name, result):
        async def read(domain_id, *args, **kwargs):
            state["reads"].append((name, str(domain_id)))
            return result
        return read

    monkeypatch.setattr(share.agency_service, "resolve_link", resolve_link)
    monkeypatch.setattr(share.agency_service, "get_brand",
                        recorder("brand", agency_service.default_brand()))
    monkeypatch.setattr(share.agency_service, "latest_report", recorder("report", None))
    for name in ("count_unique_visitors", "count_by_domain", "get_timeseries", "get_top_pages"):
        monkeypatch.setattr(share.event_service, name, recorder(name, [] if "get" in name else 0))
    for name in ("count_by_domain", "get_bounce_rate", "get_avg_duration",
                 "get_source_type_breakdown", "get_top_referrers"):
        monkeypatch.setattr(share.session_service, name,
                            recorder("s." + name, [] if "get_" in name and "rate" not in name
                                     and "duration" not in name else 0))
    monkeypatch.setattr(share.recording_service, "list_by_domain", recorder("recordings", []))
    monkeypatch.setattr(share.recording_service, "count_by_domain", recorder("rec_count", 0))

    async def get_by_id_light(recording_id):
        return {"id": recording_id, "domain_id": SITE_B}  # belongs to another site

    monkeypatch.setattr(share.recording_service, "get_by_id_light", get_by_id_light)
    return state


def test_share_dashboard_reads_only_the_links_site(public):
    client = TestClient(app)
    response = client.get(f"/api/share/good?domainId={SITE_B}&days=30")
    assert response.status_code == 200
    body = response.json()
    assert body["site"]["domain"] == "acme.com"
    assert body["permissions"] == {"recordings": False}
    sites = {site for name, site in public["reads"] if name != "brand"}
    assert sites == {SITE_A}
    assert "settings" not in body and "token" not in body
    assert response.headers["cache-control"] == "private, no-store"


@pytest.mark.parametrize("path", ["/api/share/bad", "/api/share/bad/report.pdf",
                                  "/api/share/bad/recordings"])
def test_unknown_or_revoked_links_are_404(public, path):
    assert TestClient(app).get(path).status_code == 404
    assert public["reads"] == []


def test_recordings_are_refused_unless_the_link_allows_them(public):
    client = TestClient(app)
    assert client.get("/api/share/good/recordings").status_code == 403
    assert client.get(f"/api/share/good/recordings/{SITE_B}").status_code == 403
    assert all(name not in ("recordings", "rec_count") for name, _ in public["reads"])


def test_a_recording_from_another_site_is_not_found(public):
    public["link"] = _link_row("t", allow_recordings=True)
    client = TestClient(app)
    assert client.get("/api/share/good/recordings").status_code == 200
    rec = "66666666-6666-4666-8666-666666666666"
    assert client.get(f"/api/share/good/recordings/{rec}").status_code == 404
    assert {site for _, site in public["reads"]} == {SITE_A}


def test_share_has_no_write_routes():
    for route in share.router.routes:
        assert route.methods <= {"GET", "HEAD"}, route.path


def test_brand_logo_can_be_embedded_cross_origin(monkeypatch):
    async def logo_by_key(key):
        return b"\x89PNG" if key == "a" * 32 else None

    monkeypatch.setattr(share.agency_service, "logo_by_key", logo_by_key)
    client = TestClient(app)
    response = client.get(f"/api/share/brand-logo/{'a' * 32}")
    assert response.status_code == 200
    assert response.headers["cross-origin-resource-policy"] == "cross-origin"
    assert client.get(f"/api/share/brand-logo/{'b' * 32}").status_code == 404


# ── The report ───────────────────────────────────────────────────────────────


def test_previous_month_and_bounds():
    assert client_report_service.previous_month(NOW) == "2026-09"
    assert client_report_service.previous_month(datetime(2026, 1, 1, tzinfo=UTC)) == "2025-12"
    start, end = client_report_service.month_bounds("2026-12")
    assert (start, end) == (datetime(2026, 12, 1, tzinfo=UTC), datetime(2027, 1, 1, tzinfo=UTC))
    with pytest.raises(ValueError):
        client_report_service.month_bounds("2026-13")


def _sample() -> dict:
    return client_report_service.assemble(
        {"id": SITE_A, "domain": "acme.com", "name": "Acme Bakery"},
        "2026-09",
        {"visitors": 1200, "visitors_before": 1000, "sessions": 1500, "sessions_before": 1300,
         "pageviews": 4200, "pageviews_before": 3900, "bounces": 600},
        pages=[{"path": "/menu", "views": 900, "visitors": 700},
               {"path": "/", "views": 800, "visitors": 650}],
        channels=[{"channel": "organic", "sessions": 900}, {"channel": "direct", "sessions": 600}],
        referrers=[{"source": "google.com", "sessions": 850}],
        conversions=[{"name": "order_placed", "count": 48, "before": 60},
                     {"name": "newsletter", "count": 0, "before": 3}],
        issues={"errors": [{"label": "TypeError: x is undefined", "path": "/checkout",
                            "count": 30, "visitors": 12}],
                "rageClicks": [{"label": "Pay now", "path": "/checkout", "count": 9,
                                "visitors": 4}],
                "slowPages": [{"path": "/menu", "lcp": 4100, "samples": 80}]},
    )


def test_assemble_report_numbers():
    data = _sample()
    assert data["visitorsChangePct"] == 20
    assert data["bounceRatePct"] == 40
    assert data["conversions"] == 48 and data["conversionsChangePct"] == -24
    assert [c["name"] for c in data["topConversions"]] == ["order_placed"]
    assert data["channels"][0] == {"channel": "organic", "label": "Search engines",
                                   "sessions": 900, "sharePct": 60}
    assert data["issues"]["slowPages"][0]["lcpMs"] == 4100


def test_summary_is_plain_english():
    lines = client_report_service.summary(_sample())
    text = " ".join(lines)
    assert lines[0].startswith("1,200 people visited the site in September 2026, up 20%")
    assert "search engines (60%)" in text
    assert "/menu" in text
    assert "48 conversions" in text and "order_placed" in text
    assert "page errors affected 12 visitors" in text


def test_summary_without_visits_points_at_the_tracking_code():
    data = client_report_service.assemble(
        {"id": SITE_A, "domain": "acme.com"}, "2026-09", {}, pages=[], channels=[],
        referrers=[], conversions=[], issues={})
    assert "tracking code" in client_report_service.summary(data)[0]


async def test_build_reads_one_site_and_skips_insights_without_visits(monkeypatch):
    seen = []

    def fetch(result):
        async def read(domain_id, *args):
            seen.append(str(domain_id))
            return result
        return read

    monkeypatch.setattr(client_report_service, "_totals", fetch({}))
    for name in ("_top_pages", "_channels", "_referrers", "_conversions"):
        monkeypatch.setattr(client_report_service, name, fetch([]))
    monkeypatch.setattr(client_report_service, "_issues", fetch({}))

    async def no_insights(*args):
        raise AssertionError("insights are not fetched for an empty month")

    monkeypatch.setattr(client_report_service, "_insights", no_insights)
    data = await client_report_service.build({"id": SITE_A, "domain": "acme.com"}, "2026-09")
    assert set(seen) == {SITE_A}
    assert data["period"] == "2026-09" and data["summary"]


def test_pdf_is_white_label_unless_powered_by_is_on():
    data = _sample()
    data["summary"] = client_report_service.summary(data)
    brand = {**agency_service.default_brand(), "name": "Pixel & Co", "color": "#1a73e8",
             "showPoweredBy": False}
    pdf = client_report_service.render_pdf(data, brand, compress=False)
    assert pdf.startswith(b"%PDF")
    assert b"Thravic" not in pdf
    assert b"Pixel & Co" in pdf
    powered = client_report_service.render_pdf(data, {**brand, "showPoweredBy": True},
                                               compress=False)
    assert b"Powered by Thravic" in powered


def test_pdf_draws_a_logo_and_odd_characters():
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (300, 100), (200, 30, 30)).save(buf, format="PNG")
    logo = agency_service.normalise_logo(buf.getvalue())
    data = _sample()
    data["site"] = "Café “Ünïcode” — 東京 → ok"
    data["summary"] = ["Visitors rose −5% … fine"]
    brand = {**agency_service.default_brand(), "logo": logo, "logoKey": "k"}
    assert client_report_service.render_pdf(data, brand).startswith(b"%PDF")


def test_email_is_white_label():
    data = _sample()
    data["summary"] = client_report_service.summary(data)
    brand = {**agency_service.default_brand(), "name": "Pixel <&> Co", "showPoweredBy": False}
    subject, html, text = client_report_service.render_email(data, brand, None)
    assert subject == "Acme Bakery: your September 2026 report"
    assert "Thravic" not in html and "Thravic" not in text
    assert "Pixel &lt;&amp;&gt; Co" in html
    _, html_on, text_on = client_report_service.render_email(
        data, {**brand, "showPoweredBy": True}, "https://api.example.com/logo.png")
    assert "Powered by Thravic" in html_on and "Powered by Thravic" in text_on
    assert 'src="https://api.example.com/logo.png"' in html_on


def test_logo_upload_rejects_non_images():
    with pytest.raises(ValueError):
        agency_service.normalise_logo(b"<svg onload=alert(1)></svg>")
    with pytest.raises(ValueError):
        agency_service.normalise_logo(b"")


def test_recipients_are_cleaned():
    good, error = agency_service.clean_recipients([" A@Example.com ", "a@example.com", ""])
    assert (good, error) == (["a@example.com"], None)
    assert agency_service.clean_recipients(["not-an-email"])[1]
    assert agency_service.clean_recipients([f"u{i}@x.co" for i in range(11)])[1]
    assert agency_service.clean_recipients("a@b.co")[1]


# ── Overview ─────────────────────────────────────────────────────────────────


def test_overview_puts_sites_needing_attention_first():
    sites = [
        {"id": "a", "domain": "busy.com", "owned": True},
        {"id": "b", "domain": "broken.com", "owned": True},
        {"id": "c", "domain": "alerted.com", "owned": False},
    ]
    rows = agency.overview_rows(
        sites,
        visitors=[{"domain_id": "a", "visitors": 5000, "visitors_before": 4800, "last_visit": NOW},
                  {"domain_id": "b", "visitors": 0, "visitors_before": 300, "last_visit": None},
                  {"domain_id": "c", "visitors": 200, "visitors_before": 400,
                   "last_visit": NOW}],
        conversions=[],
        alerts=[{"domain_id": "c", "open_alerts": 2, "latest_alert": "Errors spiked"}],
        reports=[{"domain_id": "a", "last_report_at": NOW, "last_report_month": "2026-09"}],
        settings=[{"domain_id": "a", "enabled": True}],
    )
    assert [r["domain"] for r in rows] == ["alerted.com", "broken.com", "busy.com"]
    assert rows[0]["attention"] == ["2 alerts in the last 7 days", "Visitors down 50%"]
    assert rows[1]["attention"][0].startswith("No visits this period")
    assert rows[2]["attention"] == [] and rows[2]["lastReportMonth"] == "2026-09"
    assert rows[2]["reportsOn"] is True
