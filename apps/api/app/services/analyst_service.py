# ruff: noqa: E501 - the model prompt and answer wording read better unwrapped
"""The AI analyst: "Why did sign-ups drop last week?" answered from the site's own numbers.

1. `parse_question` maps the question to a metric and a period by keywords, with
   no model call. When it can't tell the metric, the page shows a picker.
2. `insight_facts.explain` computes the change, the pages, sources, devices,
   countries and browsers behind it, the errors, rage clicks and slow pages in
   the part that moved most, and the visits to watch.
3. One model call (`insight_service.ask_json`, the same provider and model as
   AI insights) writes the likely cause, the supporting numbers and one or two
   fixes from those facts only. An answer that uses any number not in the facts
   is dropped and the answer is written by rules from the same facts.

Gated like AI insights. Each analysis counts as one Ask Thravic question in the
user's daily allowance (`assistant_service.DAILY_LIMITS`).
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any

from ..db import query
from ..logging import create_logger
from . import ai_usage_service, alert_service, assistant_service, insight_facts, insight_service

log = create_logger("Analyst")

MAX_FIXES = 2
AI_MAX_TOKENS = 1500
DEFAULT_DAYS = 7
EVENT_LOOKBACK = timedelta(days=90)
MAX_EVENTS = 30
# Custom events with their own metric, or that are Thravic's own plumbing.
INTERNAL_EVENTS = frozenset({"error", "performance", "rage_click", "identify"})

NO_DATA = "No {label} were recorded in this period or the one before, so there is no change to explain."

SYSTEM_PROMPT = """You are a web analytics analyst explaining one change to a website owner who is not technical.
You receive the owner's QUESTION and FACTS: the change being asked about (kind "change"), the site's overall numbers ("overview"), the parts of the site behind the change ranked by their share of it ("segment"), and problems seen in the part that moved most, or across the site ("evidence"). Each fact has an id (F1, F2, ...), a subject and numbers.

Write:
- "cause": the most likely cause in one or two plain sentences. Name the page, source, device, country or browser. If the facts show where the change happened but not why, say where, say what the evidence suggests, and claim no more than the facts show.
- "explanation": up to 3 short sentences giving the before and after numbers that support the cause.
- "fixes": one or two concrete things the owner can do this week, each under 200 characters.
- "facts": the ids of the facts you used.

Rules:
- Use ONLY numbers that appear in the facts. Do not calculate, estimate or round differently.
- If the change is small or the numbers are tiny, say so plainly. Never invent a problem.
- Plain words, no jargon. Say "visits" not "sessions". Never use dashes (— or –) to join phrases.
- Answer in the language of the question.

Reply with JSON only, in this shape:
{"cause": "...", "explanation": "...", "fixes": ["..."], "facts": ["F1"]}"""


# ── The question ───────────────────────────────────────────────────────────

_METRIC_PATTERNS: tuple[tuple[str, str], ...] = (
    ("bounce_rate", r"\bbounc"),
    ("rage_clicks", r"\brage"),
    ("errors", r"\b(errors?|crash\w*|bugs?|broken)\b"),
    ("pageviews", r"\b(page ?views?|screen ?views?|views)\b"),
    ("sessions", r"\b(sessions?|visits)\b"),
    ("visitors", r"\b(visitors?|traffic|people|users?|audience|customers?)\b"),
)

# Words for a conversion in a question, and what the matching custom event's name contains.
_CONVERSIONS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (r"\b(sign ?-?ups?|signed up|regist\w*|join\w*|accounts?)\b", ("sign", "regist", "join", "account")),
    (r"\b(purchas\w*|orders?|sales?|buy\w*|bought|checkouts?|payments?|paid)\b", ("purchas", "order", "sale", "buy", "checkout", "pay")),
    (r"\b(leads?|contacts?|enquir\w*|inquir\w*|quotes?|forms?|bookings?)\b", ("lead", "contact", "enquir", "inquir", "quote", "form", "book")),
    (r"\b(subscri\w*|newsletter)\b", ("subscri", "newsletter")),
    (r"\b(downloads?)\b", ("download",)),
)
_GENERIC_CONVERSION = r"\b(conver\w*|goals?)\b"


def _compact(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def match_event(question: str, events: list[str]) -> tuple[bool, str | None]:
    """(asked about a conversion, the custom event it means or None)."""
    q = question.lower()
    q_compact = _compact(question)
    named = [
        e for e in events
        if len(_compact(e)) >= 3 and (_compact(e) in q_compact or _compact(e).rstrip("s") in q_compact)
    ]
    if named:
        return True, max(named, key=lambda e: len(_compact(e)))
    for pattern, roots in _CONVERSIONS:
        if re.search(pattern, q):
            for event in events:
                if any(root in _compact(event) for root in roots):
                    return True, event
            return True, None
    if re.search(_GENERIC_CONVERSION, q):
        return True, events[0] if len(events) == 1 else None
    return False, None


def parse_metric(question: str, events: list[str]) -> tuple[str | None, str | None]:
    """(metric, custom event) the question is about; metric None when unclear."""
    conversion, event = match_event(question, events)
    if event:
        return "event", event
    if conversion:
        return None, None  # a conversion we can't name: let the owner pick the event
    q = question.lower()
    for metric, pattern in _METRIC_PATTERNS:
        if re.search(pattern, q):
            return metric, None
    return None, None


def parse_period(question: str, clock: assistant_service.Clock) -> tuple[datetime, datetime] | None:
    """The period named in the question, in the user's own days; None when none is."""
    q = question.lower()
    local = clock.now + clock.offset
    this_monday = clock.local_midnight(local.weekday())
    if match := re.search(r"\b(?:last|past|previous) (\d{1,3}) days\b", q):
        return clock.now - timedelta(days=int(match.group(1))), clock.now
    if re.search(r"\b(last|previous) week\b|\bweek before\b", q):
        return this_monday - timedelta(days=7), this_monday
    if re.search(r"\bthis week\b", q):
        return this_monday, clock.now
    if re.search(r"\bpast (7 days|week)\b", q):
        return clock.now - timedelta(days=7), clock.now
    if re.search(r"\b(last|previous) month\b", q):
        return clock.resolve({"period": "last_month"})
    if re.search(r"\bthis month\b", q):
        return clock.resolve({"period": "this_month"})
    if re.search(r"\bpast month\b", q):
        return clock.now - timedelta(days=30), clock.now
    if re.search(r"\byesterday\b", q):
        return clock.resolve({"period": "yesterday"})
    if re.search(r"\btoday\b", q):
        return clock.resolve({"period": "today"})
    return None


def choose_period(
    question: str, clock: assistant_service.Clock, start: datetime | None, end: datetime | None
) -> tuple[datetime, datetime]:
    """An explicit range, else the question's, else the dashboard's, else the last 7 days."""
    if start and end:
        chosen = (start, min(end, clock.now))
    else:
        chosen = parse_period(question, clock) or clock.selected or (
            clock.now - timedelta(days=DEFAULT_DAYS), clock.now
        )
    start, end = chosen
    start = max(start, end - insight_service.MAX_PERIOD)
    if start >= end:
        start = end - timedelta(hours=1)
    return start, end


async def site_events(domain_id: str, now: datetime) -> list[str]:
    """The owner's own custom events in the last 90 days, most used first."""
    rows = await query(
        """
        SELECT data->>'event' AS name, COUNT(*)::int AS count FROM events
        WHERE domain_id = $1 AND type = 'custom' AND created_at >= $2
          AND data->>'event' IS NOT NULL AND data->>'event' <> ''
        GROUP BY 1 ORDER BY count DESC LIMIT $3
        """,
        domain_id,
        now - EVENT_LOOKBACK,
        MAX_EVENTS + len(INTERNAL_EVENTS),
    )
    return [r["name"] for r in rows if r["name"] not in INTERNAL_EVENTS][:MAX_EVENTS]


def options(events: list[str]) -> dict[str, Any]:
    """What the picker offers."""
    metrics = [
        {"value": name, "label": label}
        for name, (label, _) in insight_facts.EXPLAIN_METRICS.items()
        if name != "event"
    ]
    return {"metrics": metrics, "events": events}


# ── The answer ─────────────────────────────────────────────────────────────


def _clip(value: Any, limit: int) -> str:
    return insight_service._clip(value, limit)


def validate(raw: Any, facts: list[dict[str, Any]], question: str) -> dict[str, Any] | None:
    """The model's answer when it is complete and uses only numbers from the facts."""
    if not isinstance(raw, dict):
        return None
    cause = _clip(raw.get("cause"), 400)
    explanation = _clip(raw.get("explanation"), 700)
    fixes = [_clip(f, 240) for f in raw.get("fixes") or [] if isinstance(f, str) and f.strip()]
    fixes = fixes[:MAX_FIXES]
    if not cause or not fixes:
        return None
    allowed = insight_service._allowed_numbers(facts) | insight_service._numbers_in(question)
    used = insight_service._numbers_in(" ".join([cause, explanation, *fixes]))
    bad = {n for n in used if n > insight_service.FREE_NUMBER_MAX and n not in allowed}
    if bad:
        log.warning(f"Dropped an AI analysis with numbers not in its facts: {sorted(bad)}")
        return None
    return {
        "cause": assistant_service.plain_dashes(cause),
        "explanation": assistant_service.plain_dashes(explanation),
        "fixes": [assistant_service.plain_dashes(f) for f in fixes],
    }


def _moved(delta: float, is_rate: bool) -> str:
    if not delta:
        return "stayed the same"
    if is_rate:
        return "went up" if delta > 0 else "went down"
    return "rose" if delta > 0 else "fell"


def _shown(value: Any, is_rate: bool) -> str:
    if value is None:
        return "none"
    return f"{value}%" if is_rate else f"{value:,}"


def rule_answer(exp: insight_facts.Explanation) -> dict[str, Any]:
    """A plain answer written from the facts alone, when the model is off or fails the checks."""
    is_rate = exp.metric == "bounce_rate"
    label = insight_facts.metric_label(exp.metric, exp.event)
    h = exp.headline
    pct = f" ({h['changePct']:+d}%)" if h.get("changePct") is not None else ""
    explanation = f"{label} {_moved(h['delta'], is_rate)} from {_shown(h['before'], is_rate)} to {_shown(h['now'], is_rate)}{pct}."

    top = exp.segments[0] if exp.segments else None
    lead = exp.evidence[0] if exp.evidence else None
    if top:
        where = f"{insight_facts.dimension_label(top['dimension'], exp.metric)} “{top['key']}”"
        share = f", {top['shareOfChangePct']}% of the change" if top.get("shareOfChangePct") is not None else ""
        cause = f"Most of the change came from {where}: {_shown(top['before'], is_rate)} before, {_shown(top['now'], is_rate)} now{share}."
        if len(exp.segments) > 1:
            nxt = exp.segments[1]
            explanation += f" Next biggest: {insight_facts.dimension_label(nxt['dimension'], exp.metric)} “{nxt['key']}” ({_shown(nxt['before'], is_rate)} to {_shown(nxt['now'], is_rate)})."
    elif h["delta"]:
        where = None
        cause = "The change is spread across the site; no single page, source, device, country or browser stands out."
    else:
        where = None
        cause = f"{label} did not change between the two periods."
    if lead:
        n = lead["numbers"]
        if lead["kind"] == "slow_page":
            explanation += f" {lead['subject']} takes {n['lcpMs']} ms to show its main content."
        else:
            explanation += f" {lead['subject']} hit {n['visitsAffected']} visits, against {n['visitsAffectedBefore']} before."

    fixes: list[str] = []
    for item in exp.evidence[:MAX_FIXES]:
        if item["kind"] == "error":
            fixes.append("Open the Errors page, reproduce this error and fix it, then watch a recording to check the page works again.")
        elif item["kind"] == "rage_click":
            fixes.append("Make the element people rage-click on work, or stop it looking clickable.")
        else:
            fixes.append("Speed this page up: compress large images and remove scripts it doesn't need.")
    if top and len(fixes) < MAX_FIXES:
        dimension = top["dimension"]
        if h["delta"] > 0 and not is_rate:
            fixes.append(f"Find out what brought the extra {label.lower()} from {where} and do more of it.")
        elif dimension in ("channel", "referrer", "campaign"):
            fixes.append(f"Check what changed with {where}: a paused campaign, a lost link or a drop in search ranking.")
        elif dimension in ("device", "browser"):
            fixes.append(f"Try the site yourself on {top['key']}; something may be broken only there.")
        elif dimension == "country":
            fixes.append("Check that payment, delivery and sign-up options still work for visitors from that country.")
        else:
            fixes.append("Open that page and go through it like a visitor would, then watch the recordings below.")
    if not fixes:
        fixes.append("Nothing needs fixing yet; check again after your next change or campaign.")
    return {"cause": cause, "explanation": explanation, "fixes": list(dict.fromkeys(fixes))[:MAX_FIXES]}


def _segment_out(seg: dict[str, Any], metric: str) -> dict[str, Any]:
    return {
        "dimension": insight_facts.dimension_label(seg["dimension"], metric),
        "key": seg["key"],
        "now": seg["now"],
        "before": seg["before"],
        "delta": seg["delta"],
        "changePct": seg["changePct"],
        "shareOfChangePct": seg["shareOfChangePct"],
        "link": seg["link"],
    }


async def analyse(
    domain: dict[str, Any],
    metric: str,
    event: str | None,
    start: datetime,
    end: datetime,
    question: str = "",
) -> dict[str, Any]:
    """The full analysis of one metric's change between `start`..`end` and the period before."""
    w = insight_facts.Windows.covering(start, end)
    exp = await insight_facts.explain(domain, metric, w, event)
    label = insight_facts.metric_label(metric, event)
    h = exp.headline
    has_data = bool(h.get("visits", h["now"]) or h.get("visitsBefore", h["before"]))

    answer, ai = None, False
    if has_data:
        with ai_usage_service.scope("explain", domain.get("id")):
            raw = await insight_service.ask_json(
                SYSTEM_PROMPT,
                {"question": question or f"Why did {label.lower()} change?", "facts": exp.sheet.facts},
                AI_MAX_TOKENS,
            )
        answer = validate(raw, exp.sheet.facts, question) if raw else None
        ai = answer is not None
    if answer is None:
        answer = rule_answer(exp) if has_data else {
            "cause": NO_DATA.format(label=label.lower()), "explanation": "", "fixes": []
        }

    recordings = await alert_service.recordings_for(str(domain["id"]), exp.sessions)
    return {
        "status": "ok" if has_data else "no_data",
        "metric": metric,
        "metricLabel": label,
        "event": event,
        "isRate": metric == "bounce_rate",
        "period": {
            "current": {"start": w.mid, "end": w.end},
            "previous": {"start": w.start, "end": w.mid},
        },
        "headline": {k: h.get(k) for k in ("now", "before", "delta", "changePct")},
        **answer,
        "aiGenerated": ai,
        "segments": [_segment_out(s, metric) for s in exp.segments],
        "evidence": [
            {k: item[k] for k in ("kind", "subject", "scope", "numbers", "link")}
            for item in exp.evidence
        ],
        "recordings": recordings,
        "generatedAt": datetime.now(UTC),
    }
