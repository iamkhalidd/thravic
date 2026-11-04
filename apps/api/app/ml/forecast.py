"""Holt-Winters forecast of a daily series, with a likely range for each day.

The model follows three things day by day: the level (how busy the site is
now), a damped trend (which way that is moving, fading out further ahead so one
good week doesn't project forever) and the weekly pattern (Mondays busier than
Sundays, say). How fast each one adapts is chosen per site: every setting in a
small grid is run over the history and the one whose next-day predictions were
closest wins.

The range comes from how far those next-day predictions were off, widened for
each day further ahead (the standard result for additive damped Holt-Winters).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from itertools import product

from .seasonal import SEASON, weekly_profile

MIN_DAYS = 3 * SEASON  # two weeks to start from and one to learn on
# The share of days that should land inside the range: 80%
RANGE_Z = 1.2816

ALPHAS = (0.05, 0.1, 0.2, 0.3, 0.5, 0.7)  # level
BETAS = (0.0, 0.05, 0.15)  # trend
GAMMAS = (0.05, 0.15, 0.3)  # weekly pattern
PHIS = (0.8, 0.9, 0.98)  # how slowly the trend fades


@dataclass
class Params:
    alpha: float
    beta: float
    gamma: float
    phi: float


@dataclass
class Point:
    predicted: float
    low: float
    high: float


@dataclass
class Forecast:
    points: list[Point]
    params: Params
    # Typical size of a next-day miss (root mean square), in the series' units
    error: float
    # Change in level per day at the end of the history
    trend: float


@dataclass
class _State:
    level: float
    trend: float
    offsets: list[float]
    sse: float
    n: int


def _run(values: list[float], p: Params) -> _State:
    """Run the model over `values`; next-day squared misses after the first two weeks."""
    start = weekly_profile(values)
    level, trend, offsets = start.level, start.trend, list(start.offsets)
    # The profile describes the middle of the first fortnight (day 6.5); move it
    # to the day before it starts, so day 0 is predicted one step ahead.
    level -= trend * (2 * SEASON + 1) / 2
    sse, n = 0.0, 0
    for t, y in enumerate(values):
        i = t % SEASON
        predicted = level + p.phi * trend + offsets[i]
        if t >= 2 * SEASON:
            sse += (y - predicted) ** 2
            n += 1
        new_level = p.alpha * (y - offsets[i]) + (1 - p.alpha) * (level + p.phi * trend)
        trend = p.beta * (new_level - level) + (1 - p.beta) * p.phi * trend
        offsets[i] = p.gamma * (y - new_level) + (1 - p.gamma) * offsets[i]
        level = new_level
    return _State(level, trend, offsets, sse, n)


def _spread(p: Params, h: int) -> float:
    """How much wider than a next-day miss the miss `h` days ahead is."""
    # Error-correction form of the smoothing weights
    beta = p.alpha * p.beta
    gamma = p.gamma * (1 - p.alpha)
    total = 1.0
    for j in range(1, h):
        damped = p.phi * (1 - p.phi**j) / (1 - p.phi) if p.phi < 1 else j
        c = p.alpha + beta * damped + (gamma if j % SEASON == 0 else 0.0)
        total += c * c
    return math.sqrt(total)


def fit(values: list[float]) -> tuple[Params, _State] | None:
    """The best settings for `values` and the model's state after its last day."""
    if len(values) < MIN_DAYS:
        return None
    best: tuple[Params, _State] | None = None
    for alpha, beta, gamma, phi in product(ALPHAS, BETAS, GAMMAS, PHIS):
        p = Params(alpha, beta, gamma, phi)
        state = _run(values, p)
        if best is None or state.sse < best[1].sse:
            best = (p, state)
    return best


def forecast(values: list[float], horizon: int) -> Forecast | None:
    """The next `horizon` days after the last value, or None with under `MIN_DAYS` days.

    Counts can't go below zero, so neither do the prediction and its range.
    """
    if not any(values):
        return None
    fitted = fit(values)
    if fitted is None:
        return None
    p, state = fitted
    error = math.sqrt(state.sse / state.n) if state.n else 0.0
    points = []
    damped = 0.0
    for h in range(1, horizon + 1):
        damped += p.phi**h
        mid = state.level + damped * state.trend + state.offsets[(len(values) - 1 + h) % SEASON]
        half = RANGE_Z * error * _spread(p, h)
        points.append(Point(max(0.0, mid), max(0.0, mid - half), max(0.0, mid + half)))
    return Forecast(points=points, params=p, error=error, trend=state.trend)
