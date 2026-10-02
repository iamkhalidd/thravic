"""Tests for the JS-semantics helpers.

These matter because a wrong rounding mode or URL parse produces a plausible but
different number, which is exactly the kind of drift the parity harness exists to
catch — better to pin the behaviour directly here.
"""

from __future__ import annotations

import pytest

from app.js_compat import js_round, url_path


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (0.5, 1),  # Python's round(0.5) would give 0
        (1.5, 2),  # Python's round(1.5) would give 2
        (2.5, 3),  # Python's round(2.5) would give 2
        (-0.5, 0),  # Math.round rounds half toward +Infinity
        (0.4999, 0),
        (0.5001, 1),
        (99.5, 100),
        (0, 0),
    ],
)
def test_js_round_matches_math_round(value, expected):
    assert js_round(value) == expected


def test_js_round_differs_from_builtin_round_on_ties():
    # Documents exactly why this helper exists
    assert round(2.5) == 2
    assert js_round(2.5) == 3


def test_js_round_handles_non_finite():
    assert js_round(float("nan")) == 0
    assert js_round(float("inf")) == 0


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("https://example.com/pricing", "/pricing"),
        ("https://example.com/pricing?utm_source=x", "/pricing"),
        ("http://example.com", "/"),  # empty path becomes '/'
        ("https://example.com/deep/nested/path", "/deep/nested/path"),
    ],
)
def test_url_path_extracts_pathname_from_absolute_urls(raw, expected):
    assert url_path(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "/pricing",  # no base — `new URL()` throws, so the raw value is kept
        "pricing",
        "not a url at all",
        "",
    ],
)
def test_url_path_falls_back_to_raw_for_relative_urls(raw):
    assert url_path(raw) == raw
