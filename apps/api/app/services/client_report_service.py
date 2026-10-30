"""Monthly white-label client reports: the numbers, the words, the PDF and the email.

`build` reads one site's month (visitors, top pages and sources, conversions and
the top problems) against the month before; `summary` turns that into plain
sentences; `render_pdf` and `render_email` lay it out under the agency's brand.
Nothing here says "Thravic" except the optional "powered by" line.

Conversions are the site's own custom events (sign-ups, purchases, …) — every
custom event except the ones the tracker sends itself (errors, rage clicks,
page speed, feedback, identify).

AI insights are reused when it's cheap: the insights for the month are generated
once (one model call per site per month, within the insights limits) and their
titles added to the report; without a model they fall back to the rules.
"""

from __future__ import annotations

import html
import io
import unicodedata
from datetime import UTC, datetime, timedelta
from typing import Any

from ..db import query, query_one
from ..logging import create_logger
from .event_service import URL_PATH_SQL
from .insight_facts import pct_change
from .session_service import LEGACY_SOURCE_TYPES

log = create_logger("ClientReports")

TOP_N = 5
SYSTEM_EVENTS = ("error", "rage_click", "performance", "feedback", "identify")
SLOW_LCP_MS = 2500
MAX_INSIGHTS = 3

CHANNEL_LABELS = {
    "direct": "Direct",
    "organic": "Search engines",
    "social": "Social media",
    "referral": "Other websites",
    "email": "Email",
    "paid": "Paid ads",
}


# ── The month ────────────────────────────────────────────────────────────────


def month_bounds(key: str) -> tuple[datetime, datetime]:
    """`("2026-09")` -> (Sep 1, Oct 1) in UTC; ValueError for a bad key."""
    year, month = (int(part) for part in key.split("-"))
    if not 1 <= month <= 12 or year < 2000:
        raise ValueError(key)
    start = datetime(year, month, 1, tzinfo=UTC)
    end = datetime(year + month // 12, month % 12 + 1, 1, tzinfo=UTC)
    return start, end


def previous_month(now: datetime) -> str:
    """The key of the last full month before `now`."""
    first = now.astimezone(UTC).replace(day=1)
    last = first - timedelta(days=1)
    return f"{last.year}-{last.month:02d}"


def month_label(key: str) -> str:
    start, _ = month_bounds(key)
    return f"{start:%B %Y}"


# ── Reading the data ─────────────────────────────────────────────────────────


async def _totals(domain_id: Any, before: datetime, start: datetime, end: datetime) -> dict:
    row = await query_one(
        """
        SELECT COUNT(DISTINCT visitor_id) FILTER (WHERE started_at >= $3)::int AS visitors,
               COUNT(DISTINCT visitor_id) FILTER (WHERE started_at < $3)::int AS visitors_before,
               COUNT(*) FILTER (WHERE started_at >= $3)::int AS sessions,
               COUNT(*) FILTER (WHERE started_at < $3)::int AS sessions_before,
               COALESCE(SUM(pageviews) FILTER (WHERE started_at >= $3), 0)::int AS pageviews,
               COALESCE(SUM(pageviews) FILTER (WHERE started_at < $3), 0)::int AS pageviews_before,
               COUNT(*) FILTER (WHERE started_at >= $3 AND pageviews <= 1)::int AS bounces
        FROM sessions
        WHERE domain_id = $1 AND started_at >= $2 AND started_at < $4
        """,
        domain_id,
        before,
        start,
        end,
    )
    return dict(row or {})


async def _top_pages(domain_id: Any, start: datetime, end: datetime) -> list[dict]:
    return await query(
        f"""
        SELECT {URL_PATH_SQL} AS path, COUNT(*)::int AS views,
               COUNT(DISTINCT visitor_id)::int AS visitors
        FROM events
        WHERE domain_id = $1 AND type = 'pageview' AND created_at >= $2 AND created_at < $3
        GROUP BY 1 ORDER BY views DESC, path LIMIT $4
        """,
        domain_id,
        start,
        end,
        TOP_N,
    )


async def _channels(domain_id: Any, start: datetime, end: datetime) -> list[dict]:
    legacy = " ".join(f"WHEN '{old}' THEN '{new}'" for old, new in LEGACY_SOURCE_TYPES.items())
    return await query(
        f"""
        SELECT CASE COALESCE(source_type, 'direct') {legacy}
                   ELSE COALESCE(source_type, 'direct') END AS channel,
               COUNT(*)::int AS sessions
        FROM sessions
        WHERE domain_id = $1 AND started_at >= $2 AND started_at < $3
        GROUP BY 1 ORDER BY sessions DESC LIMIT $4
        """,
        domain_id,
        start,
        end,
        TOP_N,
    )


async def _referrers(domain_id: Any, start: datetime, end: datetime) -> list[dict]:
    return await query(
        """
        SELECT COALESCE(NULLIF(source, ''), 'Direct') AS source, COUNT(*)::int AS sessions
        FROM sessions
        WHERE domain_id = $1 AND started_at >= $2 AND started_at < $3
        GROUP BY 1 ORDER BY sessions DESC, source LIMIT $4
        """,
        domain_id,
        start,
        end,
        TOP_N,
    )


async def _conversions(
    domain_id: Any, before: datetime, start: datetime, end: datetime
) -> list[dict]:
    return await query(
        """
        SELECT data->>'event' AS name,
               COUNT(*) FILTER (WHERE created_at >= $3)::int AS count,
               COUNT(*) FILTER (WHERE created_at < $3)::int AS before
        FROM events
        WHERE domain_id = $1 AND type = 'custom' AND created_at >= $2 AND created_at < $4
          AND COALESCE(data->>'event', '') <> ''
          AND NOT (data->>'event' = ANY($5::text[]))
        GROUP BY 1 ORDER BY count DESC, name
        """,
        domain_id,
        before,
        start,
        end,
        list(SYSTEM_EVENTS),
    )


async def _issues(domain_id: Any, start: datetime, end: datetime) -> dict[str, list[dict]]:
    errors = await query(
        f"""
        SELECT LEFT(COALESCE(NULLIF(data->>'message', ''), 'Unknown error'), 120) AS label,
               {URL_PATH_SQL} AS path, COUNT(*)::int AS count,
               COUNT(DISTINCT visitor_id)::int AS visitors
        FROM events
        WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'error'
          AND created_at >= $2 AND created_at < $3
        GROUP BY 1, 2 ORDER BY visitors DESC, count DESC LIMIT 3
        """,
        domain_id,
        start,
        end,
    )
    rage = await query(
        f"""
        SELECT LEFT(COALESCE(NULLIF(data->>'text', ''), data->>'tag', 'an element'), 60) AS label,
               {URL_PATH_SQL} AS path, COUNT(*)::int AS count,
               COUNT(DISTINCT visitor_id)::int AS visitors
        FROM events
        WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'rage_click'
          AND created_at >= $2 AND created_at < $3
        GROUP BY 1, 2 ORDER BY visitors DESC, count DESC LIMIT 3
        """,
        domain_id,
        start,
        end,
    )
    slow = await query(
        f"""
        SELECT {URL_PATH_SQL} AS path, ROUND(AVG((data->>'lcp')::numeric))::int AS lcp,
               COUNT(*)::int AS samples
        FROM events
        WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'performance'
          AND data->>'lcp' ~ '^[0-9.]+$' AND created_at >= $2 AND created_at < $3
        GROUP BY 1
        HAVING COUNT(*) >= 5 AND AVG((data->>'lcp')::numeric) > $4
        ORDER BY lcp DESC LIMIT 3
        """,
        domain_id,
        start,
        end,
        SLOW_LCP_MS,
    )
    return {"errors": errors, "rageClicks": rage, "slowPages": slow}


async def _insights(domain: dict[str, Any], start: datetime, end: datetime) -> list[dict]:
    """Up to three insight titles for the month; [] if they can't be had."""
    from . import insight_service  # imported late: it pulls in the model client

    try:
        report = await insight_service.todays_report(domain, start, end)
    except Exception as exc:  # noqa: BLE001 — the report goes out without them
        log.warning(f"Insights for the client report of {domain.get('domain')} failed: {exc}")
        return []
    return [
        {"title": i.get("title", ""), "description": i.get("description", "")}
        for i in (report.get("insights") or [])[:MAX_INSIGHTS]
        if i.get("title")
    ]


async def build(
    domain: dict[str, Any], key: str, *, with_insights: bool = True
) -> dict[str, Any]:
    """The report for the site's month `key` ("2026-09"), against the month before."""
    start, end = month_bounds(key)
    before = month_bounds(previous_month(start))[0]
    d = domain["id"]
    totals = await _totals(d, before, start, end)
    data = assemble(
        domain,
        key,
        totals,
        pages=await _top_pages(d, start, end),
        channels=await _channels(d, start, end),
        referrers=await _referrers(d, start, end),
        conversions=await _conversions(d, before, start, end),
        issues=await _issues(d, start, end),
    )
    if with_insights and data["visitors"]:
        data["insights"] = await _insights(domain, start, end)
    data["summary"] = summary(data)
    return data


def assemble(
    domain: dict[str, Any],
    key: str,
    totals: dict[str, Any],
    *,
    pages: list[dict],
    channels: list[dict],
    referrers: list[dict],
    conversions: list[dict],
    issues: dict[str, list[dict]],
) -> dict[str, Any]:
    """The report as stored and rendered (plain JSON: numbers, strings and lists)."""
    n = {k: int(totals.get(k) or 0) for k in (
        "visitors", "visitors_before", "sessions", "sessions_before",
        "pageviews", "pageviews_before", "bounces",
    )}
    sessions_total = sum(c["sessions"] for c in channels) or 1
    conv_now = sum(int(c["count"]) for c in conversions)
    conv_before = sum(int(c["before"]) for c in conversions)
    return {
        "site": domain.get("name") or domain.get("domain") or "",
        "domain": domain.get("domain") or "",
        "period": key,
        "periodLabel": month_label(key),
        "visitors": n["visitors"],
        "visitorsBefore": n["visitors_before"],
        "visitorsChangePct": pct_change(n["visitors"], n["visitors_before"]),
        "sessions": n["sessions"],
        "sessionsBefore": n["sessions_before"],
        "pageviews": n["pageviews"],
        "pageviewsBefore": n["pageviews_before"],
        "bounceRatePct": round(n["bounces"] / n["sessions"] * 100) if n["sessions"] else 0,
        "topPages": [
            {"path": p["path"], "views": int(p["views"]), "visitors": int(p["visitors"])}
            for p in pages[:TOP_N]
        ],
        "channels": [
            {
                "channel": c["channel"],
                "label": CHANNEL_LABELS.get(c["channel"], str(c["channel"]).capitalize()),
                "sessions": int(c["sessions"]),
                "sharePct": round(int(c["sessions"]) / sessions_total * 100),
            }
            for c in channels[:TOP_N]
        ],
        "topSources": [
            {"source": r["source"], "sessions": int(r["sessions"])} for r in referrers[:TOP_N]
        ],
        "conversions": conv_now,
        "conversionsBefore": conv_before,
        "conversionsChangePct": pct_change(conv_now, conv_before),
        "topConversions": [
            {"name": c["name"], "count": int(c["count"]), "before": int(c["before"])}
            for c in conversions[:TOP_N]
            if int(c["count"])
        ],
        "issues": {
            "errors": [
                {"label": e["label"], "path": e["path"], "count": int(e["count"]),
                 "visitors": int(e["visitors"])}
                for e in issues.get("errors", [])
            ],
            "rageClicks": [
                {"label": r["label"], "path": r["path"], "count": int(r["count"]),
                 "visitors": int(r["visitors"])}
                for r in issues.get("rageClicks", [])
            ],
            "slowPages": [
                {"path": s["path"], "lcpMs": int(s["lcp"]), "samples": int(s["samples"])}
                for s in issues.get("slowPages", [])
            ],
        },
        "insights": [],
        "summary": [],
    }


# ── Words ────────────────────────────────────────────────────────────────────


def _n(value: int) -> str:
    return f"{value:,}"


def _plural(value: int, word: str) -> str:
    return f"{_n(value)} {word}{'' if value == 1 else 's'}"


def _trend(pct: int | None) -> str:
    if pct is None:
        return ""
    if pct == 0:
        return ", the same as the month before"
    return f", {'up' if pct > 0 else 'down'} {abs(pct)}% on the month before"


def summary(data: dict[str, Any]) -> list[str]:
    """The report in a few plain sentences, for a business owner, not an analyst."""
    out: list[str] = []
    visitors = data["visitors"]
    if not visitors:
        out.append(
            f"No visits were recorded in {data['periodLabel']}. If the site was live, "
            "check that the tracking code is still installed."
        )
        return out

    sentence = f"{_plural(visitors, 'person')} visited the site in {data['periodLabel']}"
    sentence = sentence.replace("persons", "people")
    if data["visitorsChangePct"] is None and data["visitorsBefore"] == 0:
        sentence += ", the first month with visits"
    else:
        sentence += _trend(data["visitorsChangePct"])
    out.append(sentence + f", viewing {_plural(data['pageviews'], 'page')} in total.")

    if data["channels"]:
        top = data["channels"][0]
        out.append(f"Most visits came from {top['label'].lower()} ({top['sharePct']}%).")
    if data["topPages"]:
        page = data["topPages"][0]
        out.append(f"The most viewed page was {page['path']} ({_plural(page['views'], 'view')}).")

    if data["conversions"]:
        line = f"Visitors completed {_plural(data['conversions'], 'conversion')}"
        line += _trend(data["conversionsChangePct"])
        if data["topConversions"]:
            line += f"; the most common was “{data['topConversions'][0]['name']}”"
        out.append(line + ".")

    issues = data["issues"]
    problems = []
    if issues["errors"]:
        hit = sum(e["visitors"] for e in issues["errors"])
        problems.append(f"page errors affected {_plural(hit, 'visitor')}")
    if issues["slowPages"]:
        problems.append(f"{_plural(len(issues['slowPages']), 'page')} loaded slowly")
    if issues["rageClicks"]:
        where = issues['rageClicks'][0]['path']
        problems.append(f"visitors clicked repeatedly in frustration on {where}")
    if problems:
        out.append("Things to fix: " + "; ".join(problems) + ".")
    else:
        out.append("No errors, slow pages or frustrated clicks stood out this month.")
    return out


# ── PDF ──────────────────────────────────────────────────────────────────────

_PUNCTUATION = str.maketrans({
    "“": '"', "”": '"', "‘": "'", "’": "'", "–": "-", "—": "-", "−": "-", "…": "...",
    "→": "->", "•": "-", " ": " ",
})


def pdf_text(value: Any) -> str:
    """Text the PDF's built-in fonts can draw (Latin-1): accents kept, the rest folded."""
    text = str(value).translate(_PUNCTUATION)
    try:
        text.encode("latin-1")
        return text
    except UnicodeEncodeError:
        folded = unicodedata.normalize("NFKD", text)
        out = []
        for ch in folded:
            try:
                ch.encode("latin-1")
                out.append(ch)
            except UnicodeEncodeError:
                if not unicodedata.combining(ch):
                    out.append("?")
        return unicodedata.normalize("NFC", "".join(out))


def _rgb(color: str) -> tuple[int, int, int]:
    color = color.lstrip("#")
    return int(color[0:2], 16), int(color[2:4], 16), int(color[4:6], 16)


def _change_label(pct: int | None, before: int) -> str:
    if pct is None:
        return "new" if before == 0 else ""
    if pct == 0:
        return "no change"
    return f"{'+' if pct > 0 else '-'}{abs(pct)}% vs last month"


def render_pdf(data: dict[str, Any], brand: dict[str, Any], *, compress: bool = True) -> bytes:
    """The report as a one- or two-page A4 PDF under the agency's brand."""
    from fpdf import FPDF

    accent = _rgb(brand.get("color") or "#111827")
    agency = brand.get("name") or ""
    pdf = FPDF(format="A4")
    pdf.set_compression(compress)
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_margins(18, 18, 18)
    pdf.set_title(pdf_text(f"{data['site']} - {data['periodLabel']}"))
    pdf.set_author(pdf_text(agency))
    pdf.set_creator(pdf_text(agency))
    pdf.set_producer(pdf_text(agency))
    pdf.add_page()
    width = pdf.w - pdf.l_margin - pdf.r_margin

    # Header: logo (or the agency's name), then the site and month.
    if brand.get("logo"):
        try:
            pdf.image(io.BytesIO(brand["logo"]), x=pdf.l_margin, y=pdf.t_margin, h=14)
            pdf.set_y(pdf.t_margin + 18)
        except Exception as exc:  # noqa: BLE001 — a bad logo must not stop the report
            log.warning(f"Logo could not be drawn: {exc}")
    if agency and pdf.get_y() <= pdf.t_margin + 1:
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(*accent)
        pdf.cell(width, 8, pdf_text(agency), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

    pdf.set_draw_color(*accent)
    pdf.set_line_width(0.8)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + width, pdf.get_y())
    pdf.ln(5)
    pdf.set_text_color(17, 24, 39)
    pdf.set_font("Helvetica", "B", 20)
    pdf.multi_cell(width, 9, pdf_text(data["site"]), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(90, 98, 110)
    pdf.cell(
        width, 6, pdf_text(f"Monthly report - {data['periodLabel']}"),
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.ln(6)

    # Headline numbers.
    stats = [
        ("Visitors", _n(data["visitors"]),
         _change_label(data["visitorsChangePct"], data["visitorsBefore"])),
        ("Page views", _n(data["pageviews"]),
         _change_label(pct_change(data["pageviews"], data["pageviewsBefore"]),
                       data["pageviewsBefore"])),
        ("Conversions", _n(data["conversions"]),
         _change_label(data["conversionsChangePct"], data["conversionsBefore"])),
        ("Bounce rate", f"{data['bounceRatePct']}%", "left after one page"),
    ]
    box = (width - 3 * 4) / 4
    top = pdf.get_y()
    for i, (label, value, note) in enumerate(stats):
        x = pdf.l_margin + i * (box + 4)
        pdf.set_fill_color(246, 247, 249)
        pdf.rect(x, top, box, 24, style="F")
        pdf.set_xy(x + 3, top + 3)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(90, 98, 110)
        pdf.cell(box - 6, 4, pdf_text(label.upper()))
        pdf.set_xy(x + 3, top + 8)
        pdf.set_font("Helvetica", "B", 15)
        pdf.set_text_color(17, 24, 39)
        pdf.cell(box - 6, 8, pdf_text(value))
        pdf.set_xy(x + 3, top + 17)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(*accent)
        pdf.cell(box - 6, 4, pdf_text(note))
    pdf.set_y(top + 30)

    def heading(text: str) -> None:
        pdf.ln(2)
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_text_color(*accent)
        pdf.cell(width, 7, pdf_text(text), new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(17, 24, 39)

    def paragraph(text: str) -> None:
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(40, 46, 56)
        pdf.multi_cell(width, 5.5, pdf_text(text), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)

    def table(rows: list[tuple[str, str]], head: tuple[str, str]) -> None:
        pdf.set_font("Helvetica", "B", 8.5)
        pdf.set_text_color(90, 98, 110)
        pdf.cell(width * 0.75, 6, pdf_text(head[0]))
        pdf.cell(width * 0.25, 6, pdf_text(head[1]), align="R", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9.5)
        pdf.set_text_color(17, 24, 39)
        pdf.set_draw_color(225, 228, 232)
        pdf.set_line_width(0.2)
        for left, right in rows:
            pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + width, pdf.get_y())
            label = pdf_text(left)
            if pdf.get_string_width(label) > width * 0.73:
                while label and pdf.get_string_width(label + "...") > width * 0.73:
                    label = label[:-1]
                label += "..."
            pdf.cell(width * 0.75, 6.5, label)
            pdf.cell(width * 0.25, 6.5, pdf_text(right), align="R", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

    heading("Summary")
    for sentence in data.get("summary") or []:
        paragraph(sentence)
    if data.get("insights"):
        heading("Insights")
        for insight in data["insights"]:
            paragraph(f"- {insight['title']}")

    if data["channels"]:
        heading("Where visitors came from")
        table([(c["label"], f"{_n(c['sessions'])} ({c['sharePct']}%)") for c in data["channels"]],
              ("Channel", "Visits"))
    if data["topSources"]:
        table([(s["source"], _n(s["sessions"])) for s in data["topSources"]],
              ("Top sources", "Visits"))
    if data["topPages"]:
        heading("Most viewed pages")
        table([(p["path"], _n(p["views"])) for p in data["topPages"]], ("Page", "Views"))
    if data["topConversions"]:
        heading("Conversions")
        table([(c["name"], _n(c["count"])) for c in data["topConversions"]], ("Event", "Count"))

    issues = data["issues"]
    rows = (
        [(f"Error: {e['label']} ({e['path']})", _plural(e["visitors"], "visitor"))
         for e in issues["errors"]]
        + [(f"Slow page: {s['path']}", f"{s['lcpMs'] / 1000:.1f}s to load")
           for s in issues["slowPages"]]
        + [(f"Frustrated clicks on {r['label']} ({r['path']})", _plural(r["visitors"], "visitor"))
           for r in issues["rageClicks"]]
    )
    if rows:
        heading("Top issues")
        table(rows, ("Issue", "Affected"))

    if brand.get("showPoweredBy", True):
        pdf.ln(4)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(150, 155, 162)
        pdf.cell(width, 5, "Powered by Thravic", align="C")

    return bytes(pdf.output())


def pdf_filename(data: dict[str, Any]) -> str:
    safe = "".join(ch if ch.isalnum() or ch in "-." else "-" for ch in data["domain"] or "site")
    return f"{safe}-report-{data['period']}.pdf"


# ── Email ────────────────────────────────────────────────────────────────────


def _e(value: Any) -> str:
    return html.escape(str(value))


def render_email(
    data: dict[str, Any], brand: dict[str, Any], logo_url: str | None
) -> tuple[str, str, str]:
    """`(subject, html, text)`: a light, white-label email; the PDF is attached."""
    accent = brand.get("color") or "#111827"
    agency = brand.get("name") or ""
    subject = f"{data['site']}: your {data['periodLabel']} report"
    font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"

    if logo_url:
        header = (f'<img src="{_e(logo_url)}" alt="{_e(agency)}" height="40" '
                  'style="display:block;border:0;height:40px;width:auto;">')
    else:
        header = (f'<div style="font-family:{font};font-size:18px;font-weight:700;'
                  f'color:{_e(accent)};">{_e(agency)}</div>')

    def stat(label: str, value: str) -> str:
        return (f'<td style="padding:12px;background:#f6f7f9;border-radius:8px;'
                f'font-family:{font};">'
                f'<div style="font-size:11px;color:#5a626e;text-transform:uppercase;">'
                f'{_e(label)}</div><div style="font-size:20px;font-weight:700;color:#111827;">'
                f'{_e(value)}</div></td>')

    stats = "".join([
        stat("Visitors", _n(data["visitors"])),
        '<td width="8"></td>',
        stat("Page views", _n(data["pageviews"])),
        '<td width="8"></td>',
        stat("Conversions", _n(data["conversions"])),
    ])
    sentences = "".join(
        f'<p style="margin:0 0 12px;font-family:{font};font-size:15px;line-height:1.6;'
        f'color:#28303a;">{_e(s)}</p>'
        for s in data.get("summary") or []
    )
    powered = (
        f'<p style="margin:24px 0 0;font-family:{font};font-size:11px;color:#9aa0a8;">'
        "Powered by Thravic</p>"
        if brand.get("showPoweredBy", True)
        else ""
    )
    body = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_e(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
  style="max-width:560px;">
<tr><td style="padding-bottom:16px;border-bottom:3px solid {_e(accent)};">{header}</td></tr>
<tr><td style="padding-top:24px;">
<h1 style="margin:0 0 4px;font-family:{font};font-size:22px;color:#111827;">{_e(data['site'])}</h1>
<p style="margin:0 0 20px;font-family:{font};font-size:14px;color:#5a626e;">
Monthly report &middot; {_e(data['periodLabel'])}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
  style="margin-bottom:20px;"><tr>{stats}</tr></table>
{sentences}
<p style="margin:16px 0 0;font-family:{font};font-size:14px;color:#5a626e;">
The full report is attached as a PDF.</p>
{powered}
</td></tr></table></td></tr></table></body></html>"""

    text = "\n\n".join(
        [f"{data['site']} - monthly report, {data['periodLabel']}",
         f"Visitors: {_n(data['visitors'])}  Page views: {_n(data['pageviews'])}  "
         f"Conversions: {_n(data['conversions'])}",
         *(data.get("summary") or []),
         "The full report is attached as a PDF."]
        + (["Powered by Thravic"] if brand.get("showPoweredBy", True) else [])
    )
    return subject, body, text


# ── Sending ──────────────────────────────────────────────────────────────────


async def deliver(
    domain: dict[str, Any],
    data: dict[str, Any],
    recipients: list[str],
    trigger: str,
    logo_base_url: str,
) -> int:
    """Email the report to each recipient (one email each) and log it.

    Sent from our address under the agency's name, with replies going to the
    agency (the site owner). Returns how many emails went out; raises if none did.
    """
    from . import agency_service, email_service

    brand = await agency_service.get_brand(domain["user_id"])
    owner = await query_one("SELECT email FROM users WHERE id = $1", domain["user_id"])
    logo_url = agency_service.public_brand(brand, logo_base_url)["logoUrl"]
    subject, body, text = render_email(data, brand, logo_url)
    attachment = email_service.Attachment(pdf_filename(data), render_pdf(data, brand))
    sender = email_service.sender_named(brand["name"]) if brand["name"] else ""

    sent = 0
    last_error: Exception | None = None
    for address in recipients:
        try:
            await email_service.send_email_or_raise(
                address,
                subject,
                body,
                text,
                reply_to=(owner or {}).get("email") or "",
                sender=sender,
                attachments=[attachment],
                kind="client_report",
            )
            sent += 1
        except Exception as exc:  # noqa: BLE001 — try the other recipients
            last_error = exc
            log.warning(f"Client report for {domain.get('domain')} to one recipient failed: {exc}")
    if not sent:
        raise last_error or RuntimeError("No recipients")
    await query(
        "INSERT INTO client_reports (domain_id, period_key, trigger, recipients, data) "
        "VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING 1",
        domain["id"],
        data["period"],
        trigger,
        sent,
        data,
    )
    return sent
