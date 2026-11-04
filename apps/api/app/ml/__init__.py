"""Small statistical models fitted per site on its own daily numbers.

Nothing is trained ahead of time or stored: each model is fitted on the site's
recent history when it is needed, in plain Python (a few weeks of days is far
too little data to need numpy). The models only produce numbers; the AI and the
rules explain them, as with every other fact.

* `series`   — daily counts from query rows, one value per UTC day.
* `seasonal` — a site's normal week: its level and how each weekday differs.
* `forecast` — Holt-Winters: level, damped trend and weekly pattern, with a
  likely range for each day ahead.
* `anomaly`  — whether a day, or a slow slide over weeks, is unusual.
* `bots`     — rules and a per-visit score for bot traffic.
* `convert`  — logistic regression: how likely a visitor is to convert. The one
  model fitted ahead of time (nightly, on a few thousand visitors) and stored.
* `churn`    — whether a returning visitor has stopped coming back, against
  their own usual gap between visits.
"""
