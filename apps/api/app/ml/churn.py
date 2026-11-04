"""Has a returning visitor stopped coming back? Judged from their own rhythm.

Someone who visits every day and has been away a week is a worry; someone who
visits once a month and has been away a week is not. So each visitor is
measured against their own typical gap between visit days. With only a gap or
two to go on, that typical gap leans on the site's (`PRIOR_GAPS` pseudo-gaps of
the site's median), so one quick return doesn't make a visitor look lost.

While someone is still a regular, their visits are assumed to arrive at random
at their usual pace (a Poisson process). Then the chance of a gap as long as
the one so far is exp(-days away / typical gap), and Bayes' rule with a prior
that most returning visitors are still regulars gives the chance they are
still one. The risk is the rest.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import median

MIN_VISIT_DAYS = 2  # one gap: with the site's gap to lean on, enough to start
PRIOR_GAPS = 2.0
PRIOR_ACTIVE = 0.95
MIN_GAP_DAYS = 1.0
DEFAULT_SITE_GAP = 7.0

HIGH = 0.7
MEDIUM = 0.4


@dataclass
class Risk:
    risk: float  # 0..1
    band: str  # "high", "medium" or "low"
    typical_gap_days: float
    days_away: float
    visit_days: int


def typical_gap(days: list[int]) -> float | None:
    """The visitor's own mean gap between distinct visit days (day numbers), or None."""
    days = sorted(set(days))
    if len(days) < 2:
        return None
    return max((days[-1] - days[0]) / (len(days) - 1), MIN_GAP_DAYS)


def site_gap(gaps: list[float]) -> float:
    """The site's usual gap: the median of its returning visitors' gaps."""
    gaps = [g for g in gaps if g and g > 0]
    return max(median(gaps), MIN_GAP_DAYS) if gaps else DEFAULT_SITE_GAP


def band(risk: float) -> str:
    return "high" if risk >= HIGH else "medium" if risk >= MEDIUM else "low"


def assess(days: list[int], today: int, site_gap_days: float) -> Risk | None:
    """The visitor's risk of having stopped coming back; None for one-time visitors.

    `days` and `today` are day numbers (days since 1970-01-01, UTC)."""
    days = sorted(set(days))
    if len(days) < MIN_VISIT_DAYS:
        return None
    gaps = len(days) - 1
    own = typical_gap(days) or site_gap_days
    typical = max((gaps * own + PRIOR_GAPS * site_gap_days) / (gaps + PRIOR_GAPS), MIN_GAP_DAYS)
    away = max(today - days[-1], 0)
    still = PRIOR_ACTIVE * math.exp(-away / typical)
    active = still / (still + (1 - PRIOR_ACTIVE))
    risk = round(1 - active, 3)
    return Risk(
        risk=risk,
        band=band(risk),
        typical_gap_days=round(typical, 1),
        days_away=away,
        visit_days=len(days),
    )
