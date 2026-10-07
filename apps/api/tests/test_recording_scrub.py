"""Typed values never reach storage, even from a tracker with masking turned off."""

from __future__ import annotations

import json

from app.services.recording_scrub import scrub_events


def _snapshot(*children):
    return {
        "type": 2,
        "timestamp": 1,
        "data": {
            "node": {
                "type": 0,
                "childNodes": [
                    {"type": 2, "tagName": "body", "attributes": {}, "childNodes": list(children)}
                ],
            }
        },
    }


def _input(tag, value, input_type="text"):
    return {
        "type": 2,
        "tagName": tag,
        "attributes": {"type": input_type, "value": value},
        "childNodes": [],
    }


def test_snapshot_values_are_masked():
    events = scrub_events(
        [_snapshot(_input("input", "hunter2", "password"), _input("input", "jane@example.com"))]
    )

    raw = json.dumps(events)
    assert "hunter2" not in raw and "jane@example.com" not in raw
    assert "*******" in raw  # length kept, as rrweb masks


def test_textarea_text_is_masked():
    textarea = {
        "type": 2,
        "tagName": "textarea",
        "attributes": {},
        "childNodes": [{"type": 3, "textContent": "my secret note"}],
    }

    raw = json.dumps(scrub_events([_snapshot(textarea)]))

    assert "my secret note" not in raw


def test_page_text_is_kept():
    paragraph = {
        "type": 2,
        "tagName": "p",
        "attributes": {},
        "childNodes": [{"type": 3, "textContent": "Welcome back"}],
    }

    raw = json.dumps(scrub_events([_snapshot(paragraph)]))

    assert "Welcome back" in raw


def test_input_events_are_masked():
    event = {
        "type": 3,
        "timestamp": 2,
        "data": {"source": 5, "id": 7, "text": "hunter2", "isChecked": False},
    }

    scrub_events([event])

    assert event["data"]["text"] == "*******"


def test_mutations_are_masked():
    event = {
        "type": 3,
        "timestamp": 3,
        "data": {
            "source": 0,
            "adds": [{"parentId": 1, "node": _input("input", "4242424242424242")}],
            "attributes": [{"id": 9, "attributes": {"value": "hunter2", "class": "filled"}}],
            "removes": [],
            "texts": [],
        },
    }

    raw = json.dumps(scrub_events([event]))

    assert "4242424242424242" not in raw and "hunter2" not in raw
    assert "filled" in raw


def test_odd_shapes_are_left_alone():
    events = [
        {"type": 4, "timestamp": 1, "data": {"href": "https://example.com"}},
        {"type": 3, "timestamp": 2, "data": "not an object"},
        {"type": 2, "timestamp": 3, "data": {"node": None}},
    ]

    assert scrub_events(events) == events
