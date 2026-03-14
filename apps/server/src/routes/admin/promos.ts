// Admin Promo Codes Route — CRUD for promotional discount codes
import { Router, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { query, queryOne } from '../../db';
import { logAction } from '../../services/auditService';
import { createLogger } from '../../config/logger';
import { z } from 'zod';

const log = createLogger('Admin:Promos');
const router = Router();

// ── Validators ──────────────────────────────────────────────────────────────
const createPromoSchema = z.object({
    code: z.string().min(4).max(50).transform(v => v.toUpperCase().trim()),
    discount_type: z.enum(['percentage', 'flat']),
    discount_value: z.number().int().min(1),
    applicable_plans: z.array(z.string()).default([]),
    max_uses: z.number().int().min(1).nullable().optional(),
    max_per_user: z.number().int().min(1).default(1),
    starts_at: z.string().datetime().nullable().optional(),
    expires_at: z.string().datetime().nullable().optional(),
    active: z.boolean().default(true),
}).refine(d => {
    // Percentage discount can't exceed 100
    if (d.discount_type === 'percentage' && d.discount_value > 100) return false;
    return true;
}, { message: 'Percentage discount cannot exceed 100%' });

const updatePromoSchema = z.object({
    code: z.string().min(4).max(50).transform(v => v.toUpperCase().trim()).optional(),
    discount_type: z.enum(['percentage', 'flat']).optional(),
    discount_value: z.number().int().min(1).optional(),
    applicable_plans: z.array(z.string()).optional(),
    max_uses: z.number().int().min(1).nullable().optional(),
    max_per_user: z.number().int().min(1).optional(),
    starts_at: z.string().datetime().nullable().optional(),
    expires_at: z.string().datetime().nullable().optional(),
    active: z.boolean().optional(),
});

// ── GET /api/admin/promos — list all promo codes with usage stats ───────────
router.get('/', async (_req: AuthRequest, res: Response) => {
    try {
        const promos = await query(
            `SELECT pc.*,
                    COUNT(pr.id) as total_redemptions,
                    COALESCE(SUM(pr.original_amount - pr.discounted_amount), 0) as total_discount_given
             FROM promo_codes pc
             LEFT JOIN promo_redemptions pr ON pc.id = pr.promo_code_id
             GROUP BY pc.id
             ORDER BY pc.created_at DESC`
        );
        res.json({ promos });
    } catch (error) {
        log.error('Promos list error', error);
        res.status(500).json({ error: 'Failed to load promo codes' });
    }
});

// ── GET /api/admin/promos/:id — single promo with redemption history ────────
router.get('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const promo = await queryOne('SELECT * FROM promo_codes WHERE id = $1', [req.params.id]);
        if (!promo) return res.status(404).json({ error: 'Promo not found' });

        const redemptions = await query(
            `SELECT pr.*, u.name as user_name, u.email as user_email
             FROM promo_redemptions pr
             LEFT JOIN users u ON pr.user_id = u.id
             WHERE pr.promo_code_id = $1
             ORDER BY pr.created_at DESC
             LIMIT 100`,
            [req.params.id]
        );

        res.json({ promo, redemptions });
    } catch (error) {
        log.error('Promo detail error', error);
        res.status(500).json({ error: 'Failed to load promo details' });
    }
});

// ── POST /api/admin/promos — create a new promo code ────────────────────────
router.post('/', async (req: AuthRequest, res: Response) => {
    try {
        const data = createPromoSchema.parse(req.body);

        // Check for duplicate code
        const existing = await queryOne('SELECT id FROM promo_codes WHERE code = $1', [data.code]);
        if (existing) {
            return res.status(409).json({ error: `Promo code "${data.code}" already exists` });
        }

        const promo = await queryOne(
            `INSERT INTO promo_codes (code, discount_type, discount_value, applicable_plans,
             max_uses, max_per_user, starts_at, expires_at, active, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [data.code, data.discount_type, data.discount_value, data.applicable_plans,
             data.max_uses || null, data.max_per_user, data.starts_at || null,
             data.expires_at || null, data.active, req.userId]
        );

        await logAction({
            adminId: req.userId!, action: 'promo.create', targetType: 'promo',
            details: { code: data.code, discount_type: data.discount_type, discount_value: data.discount_value },
            ipAddress: req.ip
        });

        log.info(`Promo created: ${data.code} by admin ${req.userId}`);
        res.status(201).json(promo);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        log.error('Promo create error', error);
        res.status(500).json({ error: 'Failed to create promo code' });
    }
});

// ── PUT /api/admin/promos/:id — update a promo code ─────────────────────────
router.put('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const data = updatePromoSchema.parse(req.body);
        const updates: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (data.code !== undefined) { updates.push(`code = $${idx++}`); params.push(data.code); }
        if (data.discount_type !== undefined) { updates.push(`discount_type = $${idx++}`); params.push(data.discount_type); }
        if (data.discount_value !== undefined) { updates.push(`discount_value = $${idx++}`); params.push(data.discount_value); }
        if (data.applicable_plans !== undefined) { updates.push(`applicable_plans = $${idx++}`); params.push(data.applicable_plans); }
        if (data.max_uses !== undefined) { updates.push(`max_uses = $${idx++}`); params.push(data.max_uses); }
        if (data.max_per_user !== undefined) { updates.push(`max_per_user = $${idx++}`); params.push(data.max_per_user); }
        if (data.starts_at !== undefined) { updates.push(`starts_at = $${idx++}`); params.push(data.starts_at); }
        if (data.expires_at !== undefined) { updates.push(`expires_at = $${idx++}`); params.push(data.expires_at); }
        if (data.active !== undefined) { updates.push(`active = $${idx++}`); params.push(data.active); }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        params.push(req.params.id);
        const promo = await queryOne(
            `UPDATE promo_codes SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
            params
        );

        if (!promo) return res.status(404).json({ error: 'Promo not found' });

        await logAction({
            adminId: req.userId!, action: 'promo.update', targetType: 'promo',
            targetId: req.params.id, details: data, ipAddress: req.ip
        });

        res.json(promo);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        log.error('Promo update error', error);
        res.status(500).json({ error: 'Failed to update promo code' });
    }
});

// ── DELETE /api/admin/promos/:id — deactivate (soft delete) ─────────────────
router.delete('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const promo = await queryOne(
            'UPDATE promo_codes SET active = false WHERE id = $1 RETURNING *',
            [req.params.id]
        );
        if (!promo) return res.status(404).json({ error: 'Promo not found' });

        await logAction({
            adminId: req.userId!, action: 'promo.delete', targetType: 'promo',
            targetId: req.params.id, ipAddress: req.ip
        });

        res.json({ message: 'Promo code deactivated' });
    } catch (error) {
        log.error('Promo delete error', error);
        res.status(500).json({ error: 'Failed to deactivate promo code' });
    }
});

export default router;
