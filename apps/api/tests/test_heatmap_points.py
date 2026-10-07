"""Heatmap point building — where clicks land and how deep visitors scroll.

The tracker's click `x`/`y` are viewport pixels (`clientX`/`clientY`) while the
dashboard draws points as percentages of its canvas, so raw pixels put almost
every click off-canvas. Points are now percentages of the page. Scroll events
only ever carried `depth`, so the old x/y bucketing returned nothing for them.
"""

from __future__ import annotations

from app.routers.heatmaps import _click_points, _scroll_points


def _click(x, page_y, width=1000, height=4000, visitor="v1"):
    return {
        "visitor_id": visitor,
        "data": {"x": x, "y": 10, "pageY": page_y, "viewportWidth": width, "docHeight": height},
    }


def test_clicks_become_page_percentages():
    points, unplaced = _click_points([_click(500, 2000), _click(250, 1000)])

    assert sorted((p["x"], p["y"]) for p in points) == [(25, 25), (50, 50)]
    assert unplaced == 0


def test_clicks_from_different_screens_share_a_cell():
    phone = _click(195, 1500, width=390, height=3000)
    desktop = _click(960, 2000, width=1920, height=4000)

    points, _ = _click_points([phone, desktop])

    assert points == [{"x": 50, "y": 50, "count": 2}]


def test_points_are_clamped_to_the_canvas():
    points, _ = _click_points([_click(1200, 4100)])  # scrollbar / overscroll

    assert points == [{"x": 100, "y": 100, "count": 1}]


def test_clicks_without_page_geometry_are_counted_but_not_placed():
    legacy = {"visitor_id": "v1", "data": {"x": 900, "y": 200}}

    points, unplaced = _click_points([legacy, _click(500, 2000)])

    assert points == [{"x": 50, "y": 50, "count": 1}]
    assert unplaced == 1


def test_scroll_counts_visitors_reaching_each_milestone():
    events = [
        {"visitor_id": "a", "data": {"depth": 25}},
        {"visitor_id": "a", "data": {"depth": 50}},
        {"visitor_id": "b", "data": {"depth": 25}},
        {"visitor_id": "b", "data": {"depth": 50}},
        {"visitor_id": "b", "data": {"depth": 75}},
        {"visitor_id": "b", "data": {"depth": 100}},
        {"visitor_id": "c", "data": {"depth": 25}},
        {"visitor_id": "a", "data": {"depth": 25}},  # a later page view
    ]

    assert _scroll_points(events) == [
        {"x": 0, "y": 25, "count": 3},
        {"x": 0, "y": 50, "count": 2},
        {"x": 0, "y": 75, "count": 1},
        {"x": 0, "y": 100, "count": 1},
    ]


def test_scroll_ignores_events_without_depth():
    assert _scroll_points([{"visitor_id": "a", "data": {}}])[0]["count"] == 0
