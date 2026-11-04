"""A site's normal week: its level, its trend and how each weekday differs."""

from __future__ import annotations

from dataclasses import dataclass
from statistics import fmean

SEASON = 7  # days in the pattern


@dataclass
class WeeklyProfile:
    level: float
    # Change in level per day, from the first week to the second
    trend: float
    # What each position in the week adds to the level; `offsets[i]` is for
    # day i, i + 7, i + 14, ... of the series it was made from
    offsets: list[float]


def weekly_profile(values: list[float]) -> WeeklyProfile:
    """The level, trend and weekday offsets of the first two weeks of `values`.

    Needs at least two weeks. Holt-Winters starts from this and then learns the
    rest of the series day by day.
    """
    if len(values) < 2 * SEASON:
        raise ValueError(f"need at least {2 * SEASON} days, got {len(values)}")
    first, second = values[:SEASON], values[SEASON : 2 * SEASON]
    level = fmean(first + second)
    trend = (fmean(second) - fmean(first)) / SEASON
    # Each weekday's average over the two weeks, against the two weeks' average;
    # the trend is taken out so a rising fortnight doesn't look like busy weekends.
    offsets = []
    for i in range(SEASON):
        detrended = [
            first[i] - trend * (i - SEASON + 0.5),
            second[i] - trend * (i + 0.5),
        ]
        offsets.append(fmean(detrended) - level)
    return WeeklyProfile(level=level, trend=trend, offsets=offsets)
