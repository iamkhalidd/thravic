"""Which version of an A/B test is winning, and whether it is safe to say so.

Each version's conversion rate is a Beta(1 + conversions, 1 + misses) belief.
Drawing from every version's belief many times gives:

* the chance each version is best: how often its draw was the highest;
* its lift over the original (the first version), with a 95% likely range.

A winner is called only when one version is best in at least 95% of draws, every
version has had enough visitors and there are enough conversions overall, and
the visitors were split as the test asked (a broken split makes the numbers
untrustworthy). With plenty of data and the best two versions within 10% of each
other either way, the test is "no real difference". Otherwise it is too early,
with a rough count of how many more visitors are needed (Lehr's rule).

The draws use a fixed seed, so the same counts always give the same answer.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

DRAWS = 20000
SEED = 7
WIN_CHANCE = 0.95
MIN_VISITORS = 100  # per version
MIN_CONVERSIONS = 20  # across the test
SAME_WITHIN = 0.10  # relative lift range inside ±10%: no real difference
DETECT = 0.10  # the smallest relative change "visitors needed" aims to detect
SPLIT_MIN_VISITORS = 100
SPLIT_P = 0.001

WINNER = "winner"
NO_DIFFERENCE = "no_difference"
TOO_EARLY = "too_early"
NO_DATA = "no_data"


@dataclass
class Arm:
    id: str
    name: str
    weight: float
    visitors: int
    conversions: int

    @property
    def rate(self) -> float:
        return self.conversions / self.visitors if self.visitors else 0.0


def _quantile(values: list[float], q: float) -> float:
    """`values` must be sorted."""
    pos = q * (len(values) - 1)
    low = math.floor(pos)
    high = min(low + 1, len(values) - 1)
    return values[low] + (values[high] - values[low]) * (pos - low)


def chi_square_p(statistic: float, df: int) -> float:
    """Upper tail of the chi-square distribution (Wilson–Hilferty approximation)."""
    if df <= 0:
        return 1.0
    if statistic <= 0:
        return 1.0
    a = 2 / (9 * df)
    z = ((statistic / df) ** (1 / 3) - (1 - a)) / math.sqrt(a)
    return 0.5 * math.erfc(z / math.sqrt(2))


def split_check(arms: list[Arm]) -> float | None:
    """How likely a split this uneven is by chance, or None with too few visitors."""
    total = sum(a.visitors for a in arms)
    if total < SPLIT_MIN_VISITORS or len(arms) < 2:
        return None
    weights = [max(a.weight, 0.0) for a in arms]
    weight_sum = sum(weights)
    shares = [w / weight_sum for w in weights] if weight_sum else [1 / len(arms)] * len(arms)
    statistic = 0.0
    df = -1
    for arm, share in zip(arms, shares, strict=True):
        expected = total * share
        if expected <= 0:
            if arm.visitors:
                return 0.0  # visitors in a version meant to get none
            continue
        statistic += (arm.visitors - expected) ** 2 / expected
        df += 1
    return chi_square_p(statistic, df)


def visitors_needed(arms: list[Arm]) -> int | None:
    """Rough visitors still to come before a real difference could show (Lehr's rule)."""
    control = arms[0]
    pooled_visitors = sum(a.visitors for a in arms)
    if not pooled_visitors:
        return None
    p = sum(a.conversions for a in arms) / pooled_visitors
    if p <= 0 or p >= 1:
        return None
    best = max(arms, key=lambda a: a.rate)
    delta = max(abs(best.rate - control.rate), DETECT * max(control.rate, p))
    per_version = math.ceil(16 * p * (1 - p) / delta**2)
    return max(per_version * len(arms) - pooled_visitors, 0)


def analyse(variants: list[dict], draws: int = DRAWS) -> dict:
    """Results for versions given as {id, name, weight, visitors, conversions}.

    The first version is the original that the others are compared with.
    """
    arms = [
        Arm(
            id=str(v["id"]),
            name=str(v.get("name") or v["id"]),
            weight=float(v.get("weight") or 0),
            visitors=int(v.get("visitors") or 0),
            conversions=min(int(v.get("conversions") or 0), int(v.get("visitors") or 0)),
        )
        for v in variants
    ]
    total_visitors = sum(a.visitors for a in arms)
    total_conversions = sum(a.conversions for a in arms)
    split_p = split_check(arms)
    split_ok = split_p is None or split_p >= SPLIT_P

    rng = random.Random(SEED)
    wins = [0] * len(arms)
    lifts: list[list[float]] = [[] for _ in arms]
    gap: list[float] = []  # best versus runner-up, by observed rate
    order = sorted(range(len(arms)), key=lambda i: arms[i].rate, reverse=True)
    first, second = (order[0], order[1]) if len(order) > 1 else (0, 0)
    for _ in range(draws if total_visitors else 0):
        sample = [
            rng.betavariate(1 + a.conversions, 1 + a.visitors - a.conversions) for a in arms
        ]
        wins[max(range(len(arms)), key=sample.__getitem__)] += 1
        for i, value in enumerate(sample):
            lifts[i].append(value / sample[0] - 1)
        gap.append(sample[first] / sample[second] - 1)

    rows = []
    for i, arm in enumerate(arms):
        lift_range = sorted(lifts[i]) if i and lifts[i] else []
        control_rate = arms[0].rate
        rows.append(
            {
                "id": arm.id,
                "name": arm.name,
                "visitors": arm.visitors,
                "conversions": arm.conversions,
                "rate": round(arm.rate, 5),
                "chanceBest": round(wins[i] / draws, 4) if total_visitors else None,
                "lift": round(arm.rate / control_rate - 1, 4) if i and control_rate else None,
                "liftLow": round(_quantile(lift_range, 0.025), 4) if lift_range else None,
                "liftHigh": round(_quantile(lift_range, 0.975), 4) if lift_range else None,
            }
        )

    enough = (
        all(a.visitors >= MIN_VISITORS for a in arms) and total_conversions >= MIN_CONVERSIONS
    )
    best = max(range(len(arms)), key=lambda i: wins[i]) if total_visitors else None
    status, winner = TOO_EARLY, None
    if not total_visitors:
        status = NO_DATA
    elif enough and split_ok and wins[best] / draws >= WIN_CHANCE:
        status, winner = WINNER, arms[best].id
    elif enough and gap:
        gap.sort()
        if -SAME_WITHIN <= _quantile(gap, 0.025) and _quantile(gap, 0.975) <= SAME_WITHIN:
            status = NO_DIFFERENCE

    return {
        "status": status,
        "winner": winner,
        "variants": rows,
        "totalVisitors": total_visitors,
        "totalConversions": total_conversions,
        "visitorsNeeded": visitors_needed(arms) if status == TOO_EARLY else None,
        "splitOk": split_ok,
        "splitP": None if split_p is None else round(split_p, 6),
    }
