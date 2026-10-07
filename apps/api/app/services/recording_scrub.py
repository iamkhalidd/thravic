"""Remove typed values from rrweb events before they are stored.

The tracker masks every input (`maskAllInputs`), so values normally arrive as
asterisks already. This is the server's own guarantee: a tracker that has been
modified, or misconfigured, still cannot store what visitors type — passwords,
card numbers, messages. Every place rrweb carries a form value is masked:

* snapshots: the `value` attribute of `input`/`textarea`/`select`, and the text
  inside a `textarea`;
* input events (`IncrementalSource.Input`): `text`;
* DOM mutations: added `input`/`textarea` nodes as above, and any `value`
  attribute change.

Masking keeps the length (`*` per character), as rrweb's own masking does, so
the replay still shows that something was typed.
"""

from __future__ import annotations

from typing import Any

# rrweb EventType / IncrementalSource / NodeType values.
FULL_SNAPSHOT = 2
INCREMENTAL_SNAPSHOT = 3
SOURCE_MUTATION = 0
SOURCE_INPUT = 5
NODE_ELEMENT = 2
NODE_TEXT = 3

FORM_TAGS = frozenset({"input", "textarea", "select"})


def _mask(value: Any) -> Any:
    return "*" * len(value) if isinstance(value, str) else value


def _scrub_node(node: Any, in_textarea: bool = False) -> None:
    if not isinstance(node, dict):
        return
    if node.get("type") == NODE_TEXT and in_textarea:
        node["textContent"] = _mask(node.get("textContent"))
        return
    tag = node.get("tagName")
    attributes = node.get("attributes")
    if node.get("type") == NODE_ELEMENT and tag in FORM_TAGS and isinstance(attributes, dict):
        if "value" in attributes:
            attributes["value"] = _mask(attributes["value"])
    for child in node.get("childNodes") or []:
        _scrub_node(child, in_textarea or tag == "textarea")


def scrub_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Mask typed values in place; returns the same list."""
    for event in events:
        data = event.get("data")
        if not isinstance(data, dict):
            continue
        if event.get("type") == FULL_SNAPSHOT:
            _scrub_node(data.get("node"))
        elif event.get("type") == INCREMENTAL_SNAPSHOT:
            source = data.get("source")
            if source == SOURCE_INPUT:
                data["text"] = _mask(data.get("text"))
            elif source == SOURCE_MUTATION:
                for added in data.get("adds") or []:
                    if isinstance(added, dict):
                        _scrub_node(added.get("node"))
                for change in data.get("attributes") or []:
                    attributes = change.get("attributes") if isinstance(change, dict) else None
                    if isinstance(attributes, dict) and "value" in attributes:
                        attributes["value"] = _mask(attributes["value"])
    return events
