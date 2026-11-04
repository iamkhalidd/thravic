"""Is a visit a bot? Rules for what the request says, a score for how the visit behaved.

* `rule_reason`: the browser name says it is a crawler, a preview fetcher, an
  uptime checker, a headless or automated browser or an HTTP library, or the
  referrer is a known spam site. Checked when an event arrives; such events
  are not stored, only counted (`bot_service.record_hit`).
* `score`: signals from a finished visit that no person produces: pages
  changing faster than anyone reads, many pages with no click or scroll at
  all, the same visitor starting visit after visit. Each signal adds weight;
  a visit at `FLAG_SCORE` or over is a bot. One weak signal alone never is.

Mobile apps are left out of both: their requests come from HTTP libraries
and screens can change quickly.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from statistics import median

# Crawlers and other automated clients, by what their browser name contains.
# "cubot" is a phone brand, not a bot.
_BOT_UA = re.compile(
    r"(?<!cu)bot\b|bot[/_-]|crawl|spider|slurp|archiver|scrapy|"
    r"headless|phantomjs|puppeteer|playwright|selenium|webdriver|"
    r"lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|statuscake|site24x7|"
    r"prerender|facebookexternalhit|embedly|whatsapp|telegram|skypeuripreview|"
    r"python-requests|python-urllib|aiohttp|httpx|curl/|wget|go-http-client|"
    r"axios/|node-fetch|undici|java/|okhttp|libwww|httpclient",
    re.IGNORECASE,
)

# Referrer spam: sites that send fake visits to get their name into reports.
SPAM_REFERRERS = (
    "semalt.com",
    "buttons-for-website.com",
    "buttons-for-your-website.com",
    "darodar.com",
    "best-seo-offer.com",
    "free-share-buttons.com",
    "get-free-traffic-now.com",
    "ilovevitaly.com",
    "priceg.com",
    "hulfingtonpost.com",
    "trafficbot.life",
    "seo-traffic.xyz",
    "free-social-buttons.com",
    "simple-share-buttons.com",
)

_HOST = re.compile(r"^(?:[a-z][a-z0-9+.-]*://)?([^/:?#]+)", re.IGNORECASE)


def _host(url: str | None) -> str:
    match = _HOST.match((url or "").strip())
    return match.group(1).lower() if match else ""


def is_bot_user_agent(user_agent: str | None) -> bool:
    return not (user_agent or "").strip() or bool(_BOT_UA.search(user_agent or ""))


def is_spam_referrer(referrer: str | None) -> bool:
    host = _host(referrer)
    return any(host == spam or host.endswith("." + spam) for spam in SPAM_REFERRERS)


def rule_reason(user_agent: str | None, referrer: str | None = None) -> str | None:
    """Why the request is a bot by rule ("bot_user_agent" or "spam_referrer"), or None."""
    if is_bot_user_agent(user_agent):
        return "bot_user_agent"
    if is_spam_referrer(referrer):
        return "spam_referrer"
    return None


# ── How a visit behaved ───────────────────────────────────────────────────

FLAG_SCORE = 1.0

FAST_PAGES = 5  # this many pages or more...
FAST_GAP_S = 1.0  # ...with a typical gap under this is faster than anyone reads
QUIET_PAGES = 10  # this many pages with no click or scroll at all
REPEAT_VISITS = 30  # visits by one visitor in a day

WEIGHTS = {
    "bot_user_agent": 1.0,
    "spam_referrer": 1.0,
    "too_fast": 1.0,
    "no_interaction": 0.6,
    "repeated_visits": 0.6,
    "no_screen": 0.3,
}


@dataclass
class Signals:
    user_agent: str | None = None
    referrer: str | None = None
    screen_width: int | None = None
    # When each page view happened, in seconds, in order
    pageview_times: list[float] = field(default_factory=list)
    interactions: int = 0  # clicks, scrolls and form events
    # Whether the site collects clicks or scrolls at all
    tracks_interactions: bool = True
    visitor_visits_today: int = 1


def score(s: Signals) -> tuple[float, list[str]]:
    """The visit's bot score and the reasons behind it, strongest first."""
    reasons: list[str] = []
    rule = rule_reason(s.user_agent, s.referrer)
    if rule:
        reasons.append(rule)

    pages = len(s.pageview_times)
    if pages >= FAST_PAGES:
        gaps = [b - a for a, b in zip(s.pageview_times, s.pageview_times[1:], strict=False)]
        if median(gaps) < FAST_GAP_S:
            reasons.append("too_fast")
    if pages >= QUIET_PAGES and s.interactions == 0 and s.tracks_interactions:
        reasons.append("no_interaction")
    if s.visitor_visits_today >= REPEAT_VISITS:
        reasons.append("repeated_visits")
    if not s.screen_width:
        reasons.append("no_screen")

    reasons.sort(key=lambda r: WEIGHTS[r], reverse=True)
    return round(sum(WEIGHTS[r] for r in reasons), 2), reasons


def is_bot(s: Signals) -> bool:
    return score(s)[0] >= FLAG_SCORE
