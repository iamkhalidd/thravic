"""How likely is a visitor to convert? Logistic regression fitted per site.

A conversion is one custom event the site sends (a sign-up, a purchase...).
Each training row is one visitor: what they had done *before* their first
conversion, or everything for those who never converted, and whether they
converted. The fit is Newton's method with a little L2 shrinkage, on
standardised features, so a dozen features and a few thousand visitors fit in
well under a second in plain Python.

The model is checked on the newest fifth of visitors, held out of the fit: its
AUC there (0.5 is a coin toss, 1.0 is perfect) says whether it is worth
showing. Below `MIN_AUC` the site gets no scores rather than confident-looking
guesses.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

FEATURES = (
    "pageviews",  # log
    "active_minutes",  # log
    "interactions",  # log, clicks + scrolls + forms
    "sessions",  # log
    "days_known",  # log, first seen to last activity
    "returning",  # more than one session
    "from_search",
    "from_social",
    "from_referral",
    "from_email",
    "from_ads",  # ads and campaigns
    "mobile",
)

MIN_VISITORS = 200
MIN_CONVERTED = 20
HOLDOUT = 0.2
MIN_AUC = 0.65
L2 = 1.0
MAX_STEPS = 25
TOLERANCE = 1e-6

# Score bands, relative to the site's own conversion rate: on a site where 2%
# convert, 6% is a hot lead. Capped so a site where half convert still has bands.
HIGH_LIFT, HIGH_CAP = 3.0, 0.6
MEDIUM_LIFT, MEDIUM_CAP = 1.5, 0.4

_SOURCE_FEATURE = {
    "search": "from_search",
    "social": "from_social",
    "referral": "from_referral",
    "email": "from_email",
    "ad": "from_ads",
    "campaign": "from_ads",
}


def features(row: dict[str, Any]) -> list[float]:
    """One visitor's feature vector, in `FEATURES` order."""
    source = _SOURCE_FEATURE.get(row.get("source_type") or "")
    width = row.get("screen_width")
    values = {
        "pageviews": math.log1p(max(row.get("pageviews") or 0, 0)),
        "active_minutes": math.log1p(max(row.get("active_seconds") or 0, 0) / 60),
        "interactions": math.log1p(max(row.get("interactions") or 0, 0)),
        "sessions": math.log1p(max(row.get("sessions") or 0, 0)),
        "days_known": math.log1p(max(row.get("days_known") or 0, 0)),
        "returning": 1.0 if (row.get("sessions") or 0) > 1 else 0.0,
        "mobile": 1.0 if width and width < 768 else 0.0,
    }
    return [values.get(name, 1.0 if name == source else 0.0) for name in FEATURES]


def _sigmoid(z: float) -> float:
    if z >= 0:
        return 1 / (1 + math.exp(-z))
    e = math.exp(z)
    return e / (1 + e)


def _solve(a: list[list[float]], b: list[float]) -> list[float]:
    """a·x = b by Gaussian elimination with partial pivoting (a is small and,
    with the L2 term, positive definite)."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(m[r][col]))
        m[col], m[pivot] = m[pivot], m[col]
        p = m[col][col]
        if abs(p) < 1e-12:
            continue
        for r in range(col + 1, n):
            f = m[r][col] / p
            if f:
                for c in range(col, n + 1):
                    m[r][c] -= f * m[col][c]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        p = m[r][r]
        s = m[r][n] - sum(m[r][c] * x[c] for c in range(r + 1, n))
        x[r] = s / p if abs(p) > 1e-12 else 0.0
    return x


@dataclass
class Model:
    mean: list[float]
    scale: list[float]
    weights: list[float]  # intercept first
    base_rate: float
    auc: float | None = None
    trained_on: int = 0
    converted: int = 0
    names: list[str] = field(default_factory=lambda: list(FEATURES))

    def probability(self, x: list[float]) -> float:
        z = self.weights[0] + sum(
            w * (v - m) / s
            for w, v, m, s in zip(self.weights[1:], x, self.mean, self.scale, strict=True)
        )
        return _sigmoid(z)

    @property
    def useful(self) -> bool:
        return self.auc is not None and self.auc >= MIN_AUC

    def drivers(self, top: int = 3) -> list[str]:
        """The features that most raise the chance, strongest first."""
        ranked = sorted(zip(self.names, self.weights[1:], strict=True), key=lambda p: -p[1])
        return [name for name, weight in ranked[:top] if weight > 0.05]

    def to_json(self) -> dict[str, Any]:
        return {
            "mean": self.mean,
            "scale": self.scale,
            "weights": self.weights,
            "baseRate": self.base_rate,
            "auc": self.auc,
            "trainedOn": self.trained_on,
            "converted": self.converted,
            "names": self.names,
        }

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> Model | None:
        if list(data.get("names") or []) != list(FEATURES):
            return None  # fitted on an older feature set: wait for the next fit
        return cls(
            mean=list(data["mean"]),
            scale=list(data["scale"]),
            weights=list(data["weights"]),
            base_rate=float(data["baseRate"]),
            auc=data.get("auc"),
            trained_on=int(data.get("trainedOn") or 0),
            converted=int(data.get("converted") or 0),
        )


def fit(xs: list[list[float]], ys: list[int]) -> Model:
    """L2-regularised logistic regression by Newton's method."""
    n, d = len(xs), len(FEATURES)
    mean = [sum(x[j] for x in xs) / n for j in range(d)]
    scale = []
    for j in range(d):
        var = sum((x[j] - mean[j]) ** 2 for x in xs) / n
        scale.append(math.sqrt(var) if var > 1e-12 else 1.0)
    rows = [[1.0] + [(x[j] - mean[j]) / scale[j] for j in range(d)] for x in xs]
    base_rate = sum(ys) / n
    # Start at the base rate, so a feature that never varies stays at zero
    w = [math.log(max(base_rate, 1e-6) / max(1 - base_rate, 1e-6))] + [0.0] * d

    for _ in range(MAX_STEPS):
        grad = [0.0] * (d + 1)
        hess = [[0.0] * (d + 1) for _ in range(d + 1)]
        for row, y in zip(rows, ys, strict=True):
            p = _sigmoid(sum(wi * xi for wi, xi in zip(w, row, strict=True)))
            g, h = p - y, p * (1 - p)
            for i in range(d + 1):
                grad[i] += g * row[i]
                hi = h * row[i]
                if hi:
                    for j in range(i, d + 1):
                        hess[i][j] += hi * row[j]
        for i in range(d + 1):
            for j in range(i):
                hess[i][j] = hess[j][i]
            if i:  # the intercept is not shrunk
                grad[i] += L2 * w[i]
                hess[i][i] += L2
        step = _solve(hess, grad)
        w = [wi - si for wi, si in zip(w, step, strict=True)]
        if max(abs(s) for s in step) < TOLERANCE:
            break
    return Model(mean, scale, w, base_rate, trained_on=n, converted=sum(ys))


def auc(scores: list[float], ys: list[int]) -> float | None:
    """Area under the ROC curve: the chance a random converter outscores a random
    non-converter (ties count half). None without both kinds."""
    pos = sum(ys)
    neg = len(ys) - pos
    if not pos or not neg:
        return None
    ranked = sorted(zip(scores, ys, strict=True))
    rank_sum, i = 0.0, 0
    while i < len(ranked):
        j = i
        while j < len(ranked) and ranked[j][0] == ranked[i][0]:
            j += 1
        mid = (i + j + 1) / 2  # average 1-based rank of the tie group
        rank_sum += mid * sum(y for _, y in ranked[i:j])
        i = j
    return (rank_sum - pos * (pos + 1) / 2) / (pos * neg)


def train(rows: list[dict[str, Any]]) -> Model | None:
    """Fit on visitors oldest first; check on the newest fifth; refit on all.

    `rows` need the `features` inputs and `converted`. None when there is too
    little to learn from."""
    ys = [1 if r.get("converted") else 0 for r in rows]
    if len(rows) < MIN_VISITORS or sum(ys) < MIN_CONVERTED or sum(ys) == len(ys):
        return None
    xs = [features(r) for r in rows]
    cut = int(len(rows) * (1 - HOLDOUT))
    held_auc = None
    if sum(ys[:cut]) and sum(ys[cut:]) and sum(ys[:cut]) < cut:
        trial = fit(xs[:cut], ys[:cut])
        held_auc = auc([trial.probability(x) for x in xs[cut:]], ys[cut:])
    model = fit(xs, ys)
    model.auc = round(held_auc, 3) if held_auc is not None else None
    return model


def band(probability: float, base_rate: float) -> str:
    if probability >= min(base_rate * HIGH_LIFT, HIGH_CAP):
        return "high"
    if probability >= min(base_rate * MEDIUM_LIFT, MEDIUM_CAP):
        return "medium"
    return "low"
