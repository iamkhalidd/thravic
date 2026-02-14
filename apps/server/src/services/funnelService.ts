// ──────────────────────────────────────────────
// TrackFlow — Funnel Service
// ──────────────────────────────────────────────
import { query, queryOne, transaction } from '../db';

export interface FunnelRow {
    id: string;
    domain_id: string;
    name: string;
    description: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface FunnelStepRow {
    id: string;
    funnel_id: string;
    step_order: number;
    name: string;
    type: string;
    match_type: string;
    match_value: string;
    created_at: Date;
}

/**
 * Create a new funnel with its steps in a single transaction.
 */
export async function create(
    domainId: string,
    name: string,
    description: string,
    steps: { name: string; type: string; matchType: string; matchValue: string }[]
): Promise<FunnelRow & { steps: FunnelStepRow[] }> {
    return transaction(async (client) => {
        // Insert funnel
        const funnelResult = await client.query(
            `INSERT INTO funnels (domain_id, name, description)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [domainId, name, description]
        );
        const funnel = funnelResult.rows[0] as FunnelRow;

        // Insert steps
        const insertedSteps: FunnelStepRow[] = [];
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const stepResult = await client.query(
                `INSERT INTO funnel_steps (funnel_id, step_order, name, type, match_type, match_value)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [funnel.id, i + 1, step.name, step.type, step.matchType, step.matchValue]
            );
            insertedSteps.push(stepResult.rows[0] as FunnelStepRow);
        }

        return { ...funnel, steps: insertedSteps };
    });
}

/**
 * Get all funnels for a domain with their steps.
 */
export async function listByDomain(domainId: string): Promise<(FunnelRow & { steps: FunnelStepRow[] })[]> {
    const funnels = await query<FunnelRow>(
        `SELECT * FROM funnels WHERE domain_id = $1 ORDER BY created_at DESC`,
        [domainId]
    );

    const result: (FunnelRow & { steps: FunnelStepRow[] })[] = [];
    for (const funnel of funnels) {
        const steps = await query<FunnelStepRow>(
            `SELECT * FROM funnel_steps WHERE funnel_id = $1 ORDER BY step_order`,
            [funnel.id]
        );
        result.push({ ...funnel, steps });
    }
    return result;
}

/**
 * Get a single funnel with its steps.
 */
export async function getById(id: string): Promise<(FunnelRow & { steps: FunnelStepRow[] }) | null> {
    const funnel = await queryOne<FunnelRow>(
        `SELECT * FROM funnels WHERE id = $1`,
        [id]
    );
    if (!funnel) return null;

    const steps = await query<FunnelStepRow>(
        `SELECT * FROM funnel_steps WHERE funnel_id = $1 ORDER BY step_order`,
        [id]
    );

    return { ...funnel, steps };
}

/**
 * Update a funnel and replace its steps.
 */
export async function update(
    id: string,
    name: string,
    description: string,
    steps: { name: string; type: string; matchType: string; matchValue: string }[]
): Promise<(FunnelRow & { steps: FunnelStepRow[] }) | null> {
    return transaction(async (client) => {
        // Update funnel
        const funnelResult = await client.query(
            `UPDATE funnels SET name = $2, description = $3, updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [id, name, description]
        );
        if (funnelResult.rows.length === 0) return null;
        const funnel = funnelResult.rows[0] as FunnelRow;

        // Delete old steps and insert new ones
        await client.query(`DELETE FROM funnel_steps WHERE funnel_id = $1`, [id]);

        const insertedSteps: FunnelStepRow[] = [];
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const stepResult = await client.query(
                `INSERT INTO funnel_steps (funnel_id, step_order, name, type, match_type, match_value)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [id, i + 1, step.name, step.type, step.matchType, step.matchValue]
            );
            insertedSteps.push(stepResult.rows[0] as FunnelStepRow);
        }

        return { ...funnel, steps: insertedSteps };
    });
}

/**
 * Delete a funnel (cascade deletes its steps).
 */
export async function remove(id: string): Promise<void> {
    await query(`DELETE FROM funnels WHERE id = $1`, [id]);
}
