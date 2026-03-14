// Admin Plans Route — CRUD for plan pricing & features
import { Router, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { query, queryOne } from '../../db';
import { logAction } from '../../services/auditService';
import { createLogger } from '../../config/logger';
import { z } from 'zod';

const log = createLogger('Admin:Plans');
const router = Router();

// ── Validators ──────────────────────────────────────────────────────────────
const updatePlanSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    price: z.number().int().min(0).optional(),
    currency: z.enum(['NGN', 'USD', 'GBP', 'EUR']).optional(),
    interval: z.enum(['monthly', 'yearly']).optional(),
    events_limit: z.number().int().min(0).optional(),
    domains_limit: z.number().int().min(0).optional(),
    retention_days: z.number().int().min(1).max(3650).optional(),
    features: z.array(z.string()).optional(),
    active: z.boolean().optional(),
    sort_order: z.number().int().min(0).optional(),
});

const createPlanSchema = z.object({
    id: z.string().min(2).max(50).regex(/^[a-z0-9_]+$/, 'Plan ID must be lowercase alphanumeric'),
    name: z.string().min(1).max(100),
    price: z.number().int().min(0),
    currency: z.enum(['NGN', 'USD', 'GBP', 'EUR']).default('NGN'),
    interval: z.enum(['monthly', 'yearly']).default('monthly'),
    events_limit: z.number().int().min(0),
    domains_limit: z.number().int().min(0),
    retention_days: z.number().int().min(1).max(3650).default(30),
    features: z.array(z.string()).default([]),
    active: z.boolean().default(true),
    sort_order: z.number().int().min(0).default(0),
});

// ── GET /api/admin/plans — list all plans (including inactive) ──────────────
router.get('/', async (_req: AuthRequest, res: Response) => {
    try {
        const plans = await query(
            'SELECT * FROM plans ORDER BY sort_order ASC, created_at ASC'
        );
        res.json({ plans });
    } catch (error) {
        log.error('Plans list error', error);
        res.status(500).json({ error: 'Failed to load plans' });
    }
});

// ── POST /api/admin/plans — create a new plan ─────────────────────────────
router.post('/', async (req: AuthRequest, res: Response) => {
    try {
        const data = createPlanSchema.parse(req.body);

        // Check for duplicate ID
        const existing = await queryOne('SELECT id FROM plans WHERE id = $1', [data.id]);
        if (existing) {
            return res.status(409).json({ error: `Plan "${data.id}" already exists` });
        }

        const plan = await queryOne(
            `INSERT INTO plans (id, name, price, currency, interval, events_limit, domains_limit, retention_days, features, active, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [data.id, data.name, data.price, data.currency, data.interval,
             data.events_limit, data.domains_limit, data.retention_days,
             data.features, data.active, data.sort_order]
        );

        await logAction({
            adminId: req.userId!, action: 'plan.create', targetType: 'plan',
            targetId: data.id, details: data, ipAddress: req.ip
        });

        log.info(`Plan created: ${data.id} by admin ${req.userId}`);
        res.status(201).json(plan);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        log.error('Plan create error', error);
        res.status(500).json({ error: 'Failed to create plan' });
    }
});

// ── PUT /api/admin/plans/:id — update a plan ──────────────────────────────
router.put('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const data = updatePlanSchema.parse(req.body);

        const updates: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (data.name !== undefined) { updates.push(`name = $${idx++}`); params.push(data.name); }
        if (data.price !== undefined) { updates.push(`price = $${idx++}`); params.push(data.price); }
        if (data.currency !== undefined) { updates.push(`currency = $${idx++}`); params.push(data.currency); }
        if (data.interval !== undefined) { updates.push(`interval = $${idx++}`); params.push(data.interval); }
        if (data.events_limit !== undefined) { updates.push(`events_limit = $${idx++}`); params.push(data.events_limit); }
        if (data.domains_limit !== undefined) { updates.push(`domains_limit = $${idx++}`); params.push(data.domains_limit); }
        if (data.retention_days !== undefined) { updates.push(`retention_days = $${idx++}`); params.push(data.retention_days); }
        if (data.features !== undefined) { updates.push(`features = $${idx++}`); params.push(data.features); }
        if (data.active !== undefined) { updates.push(`active = $${idx++}`); params.push(data.active); }
        if (data.sort_order !== undefined) { updates.push(`sort_order = $${idx++}`); params.push(data.sort_order); }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        updates.push('updated_at = NOW()');
        params.push(req.params.id);

        const plan = await queryOne(
            `UPDATE plans SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
            params
        );

        if (!plan) return res.status(404).json({ error: 'Plan not found' });

        await logAction({
            adminId: req.userId!, action: 'plan.update', targetType: 'plan',
            targetId: req.params.id, details: data, ipAddress: req.ip
        });

        log.info(`Plan updated: ${req.params.id} by admin ${req.userId}`);
        res.json(plan);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        log.error('Plan update error', error);
        res.status(500).json({ error: 'Failed to update plan' });
    }
});

export default router;
