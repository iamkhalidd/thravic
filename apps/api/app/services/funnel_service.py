"""Funnel service — port of `services/funnelService.ts`."""

from __future__ import annotations

from typing import Any

from ..db import query, query_one, transaction


async def create(
    domain_id: str,
    name: str,
    description: str,
    steps: list[dict[str, str | None]],
) -> dict[str, Any] | None:
    """Insert the funnel and its steps inside one transaction.

    Step ordering is 1-based over the *input* array, not the array index, so a
    re-submitted funnel always yields the same `step_order` sequence.
    """

    async with transaction() as conn:
        funnel = await conn.fetchrow(
            """
            INSERT INTO funnels (domain_id, name, description)
            VALUES ($1, $2, $3)
            RETURNING *
            """,
            domain_id,
            name,
            description,
        )
        funnel = dict(funnel)

        inserted_steps = []
        for index, step in enumerate(steps):
            row = await conn.fetchrow(
                """
                INSERT INTO funnel_steps
                    (funnel_id, step_order, name, type, match_type, match_value, match_field)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
                """,
                funnel["id"],
                index + 1,
                step["name"],
                step["type"],
                step["matchType"],
                step["matchValue"],
                step.get("matchField"),
            )
            inserted_steps.append(dict(row))

        return {**funnel, "steps": inserted_steps}


async def list_by_domain(domain_id: str) -> list[dict[str, Any]]:
    funnels = await query(
        "SELECT * FROM funnels WHERE domain_id = $1 ORDER BY created_at DESC",
        domain_id,
    )

    result: list[dict[str, Any]] = []
    for funnel in funnels:
        steps = await query(
            "SELECT * FROM funnel_steps WHERE funnel_id = $1 ORDER BY step_order",
            funnel["id"],
        )
        result.append({**funnel, "steps": steps})
    return result


async def get_by_id(funnel_id: str) -> dict[str, Any] | None:
    funnel = await query_one("SELECT * FROM funnels WHERE id = $1", funnel_id)
    if not funnel:
        return None

    steps = await query(
        "SELECT * FROM funnel_steps WHERE funnel_id = $1 ORDER BY step_order", funnel_id
    )
    return {**funnel, "steps": steps}


async def update(
    funnel_id: str,
    name: str,
    description: str,
    steps: list[dict[str, str | None]],
) -> dict[str, Any] | None:
    """Replace the funnel row and fully rebuild its steps, in one transaction."""

    async with transaction() as conn:
        funnel = await conn.fetchrow(
            """
            UPDATE funnels SET name = $2, description = $3, updated_at = NOW()
            WHERE id = $1
            RETURNING *
            """,
            funnel_id,
            name,
            description,
        )
        if funnel is None:
            return None
        funnel = dict(funnel)

        await conn.execute("DELETE FROM funnel_steps WHERE funnel_id = $1", funnel_id)

        inserted_steps = []
        for index, step in enumerate(steps):
            row = await conn.fetchrow(
                """
                INSERT INTO funnel_steps
                    (funnel_id, step_order, name, type, match_type, match_value, match_field)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
                """,
                funnel_id,
                index + 1,
                step["name"],
                step["type"],
                step["matchType"],
                step["matchValue"],
                step.get("matchField"),
            )
            inserted_steps.append(dict(row))

        return {**funnel, "steps": inserted_steps}


async def remove(funnel_id: str) -> None:
    await query("DELETE FROM funnels WHERE id = $1", funnel_id)
