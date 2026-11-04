"""Is a number unusual for this site? Two checks on a daily series.

* `check_day`: the last day against what the forecast model expected for it,
  from the days before. The gap is measured in "normal misses": the median
  size of the model's past next-day misses (median and MAD, so one past spike
  or outage doesn't make every later gap look normal). A day is flagged only
  when it is far outside the usual **and** the change is big enough to matter,
  so 3 sessions instead of 1 is never news.
* `check_slide`: a slow slide over weeks that no single day shows, with a
  CUSUM over weekly totals: each week further from what was normal a month
  before adds to the evidence, a normal week takes some away.

Counts only, nothing stored here; `anomaly_service` runs these per site.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import median

from .forecast import MIN_DAYS, RANGE_Z, next_day
from .seasonal import SEASON

# MAD times this estimates the standard deviation of normally spread misses
MAD_TO_SD = 1.4826
# How many normal misses away a day must be
FLAG_SCORE = 3.5
# And how far from what was expected, in percent
MIN_CHANGE_PCT = 30

SLIDE_BASE_WEEKS = 4
SLIDE_WEEKS = 4
SLIDE_SLACK = 0.5  # weeks within half a normal spread add nothing
SLIDE_LIMIT = 4.0  # evidence needed
SLIDE_MIN_PCT = 20
SLIDE_DAYS = (SLIDE_BASE_WEEKS + SLIDE_WEEKS) * SEASON


@dataclass
class Finding:
    kind: str  # "day" or "slide"
    direction: str  # "up" or "down"
    actual: float
    expected: float
    # The usual range: about 80% of normal days (or weeks) land inside it
    low: float
    high: float
    score: float
    change_pct: int | None


def describe(metric: str, dimension: str, key: str) -> str:
    """The series a finding is about, in words (as `anomaly_service` names them)."""
    if metric == "event":
        return f"Custom event “{key}”"
    if metric == "errors":
        return "JavaScript errors"
    if dimension == "site":
        return "Sessions on the whole site"
    if dimension == "landing page":
        return f"Sessions landing on {key}"
    return f"Sessions from {dimension} “{key}”"


def robust_spread(values: list[float]) -> float:
    """Standard deviation estimated from the median absolute deviation."""
    if not values:
        return 0.0
    mid = median(values)
    return MAD_TO_SD * median(abs(v - mid) for v in values)


def _noise_floor(expected: float) -> float:
    # Counts vary by about their square root even on the steadiest site
    return math.sqrt(max(expected, 1.0))


def _change_pct(actual: float, expected: float) -> int | None:
    return round((actual - expected) / expected * 100) if expected >= 1 else None


def score(actual: float, normal: float, spread: float) -> float:
    """How many normal spreads `actual` is from `normal` (negative when below)."""
    return (actual - normal) / max(spread, _noise_floor(normal))


def check_day(values: list[float], min_change: float = 10) -> Finding | None:
    """Whether the last day of `values` is unusual, judged from the days before it.

    `min_change` is the smallest gap from expected that counts, in the series' units.
    """
    history, actual = values[:-1], values[-1]
    if len(history) < MIN_DAYS:
        return None
    model = next_day(history)
    if model is None:
        return None
    expected, misses = model
    spread = max(robust_spread(misses), _noise_floor(expected))
    z = (actual - expected) / spread
    change = _change_pct(actual, expected)
    if abs(z) < FLAG_SCORE or abs(actual - expected) < min_change:
        return None
    if change is not None and abs(change) < MIN_CHANGE_PCT:
        return None
    return Finding(
        kind="day",
        direction="up" if z > 0 else "down",
        actual=actual,
        expected=round(expected, 1),
        low=round(max(0.0, expected - RANGE_Z * spread), 1),
        high=round(expected + RANGE_Z * spread, 1),
        score=round(z, 1),
        change_pct=change,
    )


def weekly_totals(values: list[float], weeks: int) -> list[float]:
    """Totals of the last `weeks` whole weeks of `values`, oldest first."""
    end = len(values)
    return [sum(values[end - SEASON * (w + 1) : end - SEASON * w]) for w in reversed(range(weeks))]


def check_slide(values: list[float], min_change: float = 10) -> Finding | None:
    """Whether the last weeks of `values` slid steadily away from a month before.

    `min_change` is per day, as for `check_day`; a week must move seven times it.
    """
    if len(values) < SLIDE_DAYS:
        return None
    weeks = weekly_totals(values, SLIDE_BASE_WEEKS + SLIDE_WEEKS)
    base, recent = weeks[:SLIDE_BASE_WEEKS], weeks[SLIDE_BASE_WEEKS:]
    normal = median(base)
    if normal <= 0:
        return None
    spread = max(robust_spread(base), _noise_floor(normal), 0.05 * normal)

    for direction, sign in (("down", -1), ("up", 1)):
        evidence = 0.0
        for week in recent:
            evidence = max(0.0, evidence + sign * (week - normal) / spread - SLIDE_SLACK)
        latest = recent[-1]
        change = _change_pct(latest, normal)
        # A slide, not one odd week: the last three all outside the usual range
        steady = all(sign * (w - normal) > RANGE_Z * spread for w in recent[-3:])
        if (
            evidence >= SLIDE_LIMIT
            and steady
            and change is not None
            and abs(change) >= SLIDE_MIN_PCT
            and abs(latest - normal) >= 7 * min_change
        ):
            return Finding(
                kind="slide",
                direction=direction,
                actual=latest,
                expected=normal,
                low=round(max(0.0, normal - RANGE_Z * spread), 1),
                high=round(normal + RANGE_Z * spread, 1),
                score=round(evidence, 1),
                change_pct=change,
            )
    return None
