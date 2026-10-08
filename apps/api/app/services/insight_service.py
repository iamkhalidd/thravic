# ruff: noqa: E501 - the model prompt and insight wording read better unwrapped
"""AI insights: facts in, ranked and explained insights out, stored for the day.

`insight_facts` computes every number. The model only explains and ranks them:
each insight must cite fact ids, and any insight that cites an unknown fact or
uses a number that is not in the facts it cites is dropped. Without a usable
model answer, rule-based insights are written from the same facts.

Reports are stored (`insight_reports`) and served for the rest of the UTC day;
a refresh makes a new one, at most `MAX_REFRESHES_PER_DAY` times a day.
"""

from __future__ import annotations

import asyncio
import json
import re
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import httpx

from ..config import get_settings
from ..db import query, query_one
from ..logging import create_logger
from . import insight_facts

log = create_logger("Insights")

MAX_REFRESHES_PER_DAY = 3
MAX_INSIGHTS = 5
REPORT_RETENTION_DAYS = 30
AI_TIMEOUT_SECONDS = 45.0
AI_MAX_TOKENS = 1500

INSIGHT_TYPES = ("traffic", "page", "technical", "funnel", "opportunity")
PRIORITIES = ("high", "medium", "low")
PRIORITY_ORDER = {p: i for i, p in enumerate(PRIORITIES)}

# Numbers up to this are allowed without a source ("3 pages", "top 2"), so
# ordinary wording isn't mistaken for an invented figure.
FREE_NUMBER_MAX = 10

SYSTEM_PROMPT = """You are a web analytics analyst writing for a website owner.
You receive FACTS computed from their analytics for the last 7 days compared with the 7 days before. Each fact has an id (F1, F2, ...), a subject, numbers and a kind.

Write the 3 to 5 insights that matter most for this site, most important first. Kinds of insight:
- "traffic": what changed in traffic and where it came from (use overview + driver facts together)
- "page": landing pages losing visitors
- "technical": JavaScript errors, rage clicks, slow pages
- "funnel": where people drop out of a funnel and how that moved
- "opportunity": sources or pages that perform well but get little traffic

Rules:
- Use ONLY numbers that appear in the facts you cite. Do not calculate new numbers, estimate, or round differently.
- Every insight cites at least one fact id in "facts".
- Be specific: name the page, source, step or error. No generic advice.
- The recommendation is one concrete next step the owner can take this week.
- If the facts show nothing notable, return fewer insights. Never invent problems.
- Plain language, no jargon. Title under 70 characters, description under 300, recommendation under 200.

Reply with JSON only, in this shape:
{"insights": [{"type": "traffic|page|technical|funnel|opportunity", "priority": "high|medium|low", "title": "...", "description": "...", "recommendation": "...", "facts": ["F1"]}]}"""

_locks: dict[str, asyncio.Lock] = {}


def _day_start(now: datetime) -> datetime:
    return now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)


# ── Model call ─────────────────────────────────────────────────────────────


async def ask_model(facts: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
    """The model's raw insight list, or None when it isn't configured or fails."""
    settings = get_settings()
    if not settings.AI_API_KEY:
        return None
    payload = {
        "model": settings.AI_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "FACTS (JSON):\n" + json.dumps(facts, ensure_ascii=False)},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3,
        "max_tokens": AI_MAX_TOKENS,
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(timeout=AI_TIMEOUT_SECONDS) as client:
            response = await client.post(
                settings.AI_BASE_URL.rstrip("/") + "/chat/completions",
                headers={"Authorization": f"Bearer {settings.AI_API_KEY}"},
                json=payload,
            )
        if response.status_code >= 400:
            # The body says why (wrong model name, no balance, bad key) without
            # echoing the key, so it is safe and useful to log.
            log.error(f"AI request failed ({response.status_code}): {response.text[:500]}")
            return None
        content = response.json()["choices"][0]["message"]["content"] or ""
        parsed = json.loads(content)
    except Exception as exc:  # noqa: BLE001 - any failure falls back to rules
        log.error(f"AI request failed: {exc}")
        return None

    items = parsed.get("insights") if isinstance(parsed, dict) else parsed
    return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else None


# ── Checking the model's answer ────────────────────────────────────────────

_NUMBER = re.compile(r"(?<![\w.])-?\d[\d,]*(?:\.\d+)?")


def _numbers_in(text: str) -> set[float]:
    found = set()
    for match in _NUMBER.findall(text):
        try:
            found.add(abs(float(match.replace(",", ""))))
        except ValueError:
            continue
    return found


def _allowed_numbers(facts: list[dict[str, Any]]) -> set[float]:
    allowed: set[float] = set()
    for fact in facts:
        for value in fact["numbers"].values():
            if isinstance(value, bool) or not isinstance(value, int | float):
                continue
            allowed.update({abs(float(value)), float(round(abs(value)))})
        allowed.update(_numbers_in(fact["subject"]))
    return allowed


def _clip(value: Any, limit: int) -> str:
    text = " ".join(str(value or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def validate(raw: list[dict[str, Any]], facts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep the model's insights that cite real facts and only their numbers."""
    by_id = {fact["id"]: fact for fact in facts}
    kept: list[dict[str, Any]] = []
    for item in raw:
        cited = [f for f in item.get("facts") or [] if isinstance(f, str) and f in by_id]
        if not cited or item.get("type") not in INSIGHT_TYPES:
            continue
        title = _clip(item.get("title"), 90)
        description = _clip(item.get("description"), 400)
        recommendation = _clip(item.get("recommendation"), 300)
        if not title or not description:
            continue
        allowed = _allowed_numbers([by_id[f] for f in cited])
        used = _numbers_in(f"{title} {description} {recommendation}")
        if any(n > FREE_NUMBER_MAX and n not in allowed for n in used):
            log.warning(f"Dropped an AI insight with numbers not in its facts: {title!r}")
            continue
        kept.append(
            {
                "type": item["type"],
                "priority": item.get("priority")
                if item.get("priority") in PRIORITIES
                else "medium",
                "title": title,
                "description": description,
                "recommendation": recommendation,
                "facts": cited,
            }
        )
    return kept[:MAX_INSIGHTS]


# ── Rules over the same facts ──────────────────────────────────────────────


def _fmt_change(pct: int | None) -> str:
    if pct is None:
        return "new this week"
    return f"{'up' if pct >= 0 else 'down'} {abs(pct)}%"


def rule_insights(facts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Plain templated insights, used when the model is off or gives nothing usable."""
    out: list[dict[str, Any]] = []
    overview = next((f for f in facts if f["kind"] == "overview"), None)
    drivers = [f for f in facts if f["kind"] == "driver"]

    if overview:
        n = overview["numbers"]
        change = n.get("sessionsChangePct")
        if change is not None and abs(change) >= 10:
            top = drivers[0] if drivers else None
            because = (
                f" The biggest move: {top['subject']} ({top['numbers']['sessionsDelta']:+d})."
                if top
                else ""
            )
            out.append(
                {
                    "type": "traffic",
                    "priority": "high" if abs(change) >= 30 else "medium",
                    "title": f"Sessions {_fmt_change(change)} this week",
                    "description": f"{n['sessions']} sessions, against {n['sessionsBefore']} the week before.{because}",
                    "recommendation": "Open the source breakdown to confirm where the change came from.",
                    "facts": [overview["id"]] + ([top["id"]] if top else []),
                }
            )

    for fact in facts:
        n = fact["numbers"]
        if fact["kind"] == "page":
            out.append(
                {
                    "type": "page",
                    "priority": "high" if n["entries"] >= 100 else "medium",
                    "title": f"{fact['subject'].removeprefix('Landing page ')} loses most visitors",
                    "description": (
                        f"{n['bounceRatePct']}% of the {n['entries']} visits that start here leave "
                        f"without another page; the site average is {n['siteBounceRatePct']}%."
                    ),
                    "recommendation": "Watch a few session recordings of this page and check that its main call to action is visible.",
                    "facts": [fact["id"]],
                }
            )
        elif fact["kind"] == "technical":
            count = n.get("errors", n.get("rageClicks"))
            title = (
                f"Slow page: {n['lcpMs']} ms to show its main content"
                if "lcpMs" in n
                else f"{count} {'errors' if 'errors' in n else 'rage clicks'} this week"
            )
            out.append(
                {
                    "type": "technical",
                    "priority": "high",
                    "title": title,
                    "description": fact["subject"] + ".",
                    "recommendation": "Reproduce it on the page named above and fix it before it costs more visits.",
                    "facts": [fact["id"]],
                }
            )
        elif fact["kind"] == "funnel":
            out.append(
                {
                    "type": "funnel",
                    "priority": "high" if n["dropOffPct"] >= 50 else "medium",
                    "title": f"{n['dropOffPct']}% drop out at one funnel step",
                    "description": f"{fact['subject']}: {n['lostAtStep']} people left at this step; {n['conversionPct']}% complete the funnel.",
                    "recommendation": "Simplify that step: fewer fields, clearer next button, no surprise costs.",
                    "facts": [fact["id"]],
                }
            )
        elif fact["kind"] == "opportunity":
            out.append(
                {
                    "type": "opportunity",
                    "priority": "low",
                    "title": f"{fact['subject']} are unusually engaged",
                    "description": (
                        f"They view {n['pagesPerSession']} pages per visit against {n['sitePagesPerSession']} "
                        f"site-wide, but bring only {n['shareOfSessionsPct']}% of sessions."
                    ),
                    "recommendation": "Put more effort into this source: more posts, links or campaigns there.",
                    "facts": [fact["id"]],
                }
            )

    if not out and overview:
        out.append(
            {
                "type": "traffic",
                "priority": "low",
                "title": "A steady week",
                "description": f"{overview['numbers']['sessions']} sessions, with no large changes in traffic, pages, errors or funnels.",
                "recommendation": "Nothing needs attention; check back after your next change or campaign.",
                "facts": [overview["id"]],
            }
        )
    out.sort(key=lambda i: PRIORITY_ORDER[i["priority"]])
    return out[:MAX_INSIGHTS]


# ── Reports ────────────────────────────────────────────────────────────────


def _with_evidence(insights: list[dict], facts: list[dict], created_at: datetime) -> list[dict]:
    """What the page shows: each insight with its facts' numbers and a link."""
    by_id = {fact["id"]: fact for fact in facts}
    shown = []
    for insight in insights:
        cited = [by_id[f] for f in insight["facts"] if f in by_id]
        shown.append(
            {
                "id": str(uuid4()),
                **{
                    k: insight[k]
                    for k in ("type", "priority", "title", "description", "recommendation")
                },
                "evidence": [{"subject": f["subject"], "numbers": f["numbers"]} for f in cited],
                "link": cited[0]["link"] if cited else "/dashboard",
                "createdAt": created_at,
            }
        )
    return shown


async def generate(domain: dict[str, Any], trigger: str, now: datetime | None = None) -> dict:
    """Build facts, ask the model, store and return the report."""
    now = now or datetime.now(UTC)
    sheet = await insight_facts.build(domain, now)
    if sheet.sessions < insight_facts.MIN_SESSIONS:
        status, ai_generated, insights = "insufficient_data", False, []
    else:
        raw = await ask_model(sheet.facts)
        insights = validate(raw, sheet.facts) if raw else []
        ai_generated = bool(insights)
        if not insights:
            insights = rule_insights(sheet.facts)
        status = "ok"

    row = await query_one(
        """
        INSERT INTO insight_reports (domain_id, trigger, status, ai_generated, insights, facts)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        """,
        domain["id"],
        trigger,
        status,
        ai_generated,
        insights,
        sheet.facts,
    )
    await query(
        "DELETE FROM insight_reports WHERE domain_id = $1 AND created_at < $2 RETURNING 1",
        domain["id"],
        now - timedelta(days=REPORT_RETENTION_DAYS),
    )
    return row


async def latest_today(domain_id: str, now: datetime) -> dict | None:
    return await query_one(
        """
        SELECT * FROM insight_reports
        WHERE domain_id = $1 AND created_at >= $2
        ORDER BY created_at DESC LIMIT 1
        """,
        domain_id,
        _day_start(now),
    )


async def refreshes_today(domain_id: str, now: datetime) -> int:
    row = await query_one(
        """
        SELECT COUNT(*)::int AS count FROM insight_reports
        WHERE domain_id = $1 AND trigger = 'refresh' AND created_at >= $2
        """,
        domain_id,
        _day_start(now),
    )
    return int((row or {}).get("count") or 0)


async def todays_report(domain: dict[str, Any]) -> dict:
    """Today's report, generating it on the first view of the day.

    The lock stops two dashboard requests arriving together from both paying for
    a model call (one instance; across instances the worst case is a duplicate).
    """
    now = datetime.now(UTC)
    key = str(domain["id"])
    async with _locks.setdefault(key, asyncio.Lock()):
        report = await latest_today(key, now)
        if report is None:
            report = await generate(domain, "auto", now)
    return report


async def refresh(domain: dict[str, Any]) -> dict | None:
    """A fresh report, or None when today's refreshes are used up."""
    now = datetime.now(UTC)
    key = str(domain["id"])
    async with _locks.setdefault(key, asyncio.Lock()):
        if await refreshes_today(key, now) >= MAX_REFRESHES_PER_DAY:
            return None
        return await generate(domain, "refresh", now)


async def to_response(report: dict, domain_id: str) -> dict:
    now = datetime.now(UTC)
    insights = _with_evidence(report["insights"], report["facts"], report["created_at"])
    return {
        "status": report["status"],
        "insights": insights,
        "aiGenerated": report["ai_generated"],
        "generatedAt": report["created_at"],
        "refreshesLeft": max(0, MAX_REFRESHES_PER_DAY - await refreshes_today(domain_id, now)),
        "minSessions": insight_facts.MIN_SESSIONS,
        "period": {
            "current": {
                "start": report["created_at"] - timedelta(days=insight_facts.WINDOW_DAYS),
                "end": report["created_at"],
            },
            "previous": {
                "start": report["created_at"] - timedelta(days=2 * insight_facts.WINDOW_DAYS),
                "end": report["created_at"] - timedelta(days=insight_facts.WINDOW_DAYS),
            },
        },
    }
