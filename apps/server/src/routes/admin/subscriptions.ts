// Admin Subscriptions Route — Billing and plan management
import { Router, Response } from 'express';
import { adminAuth } from '../../middleware/adminAuth';
import { AuthRequest } from '../../middleware/auth';
import { query, queryOne } from '../../db';
import { logAction } from '../../services/auditService';
import { createLogger } from '../../config/logger';
import { updateSubscriptionSchema } from '../../validators/admin';
import { z } from 'zod';

const log = createLogger('Admin:Subscriptions');
const router = Router();

// GET /api/admin/subscriptions — list all subscriptions
router.get('/', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const plan = req.query.plan || '';
        const status = req.query.status || '';
        const limit = Math.min(parseInt((req.query.limit as string) || '25'), 100);
        const offset = parseInt((req.query.offset as string) || '0');

        const conditions: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (plan) { conditions.push(`s.plan = $${idx++}`); params.push(plan); }
        if (status) { conditions.push(`s.status = $${idx++}`); params.push(status); }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const subscriptions = await query(
            `SELECT s.*, u.name as user_name, u.email as user_email
             FROM subscriptions s
             LEFT JOIN users u ON s.user_id = u.id
             ${where}
             ORDER BY s.created_at DESC
             LIMIT $${idx++} OFFSET $${idx++}`,
            [...params, limit, offset]
        );

        const countResult = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM subscriptions s ${where}`,
            params
        );

        // Revenue summary — join plans table for dynamic pricing
        const revenue = await query(
            `SELECT s.plan, COUNT(*) as count,
                    SUM(COALESCE(p.price, 0)) as revenue,
                    COALESCE(p.currency, 'NGN') as currency
             FROM subscriptions s
             LEFT JOIN plans p ON s.plan = p.id
             WHERE s.status = 'active'
             GROUP BY s.plan, p.price, p.currency
             ORDER BY revenue DESC`
        );

        res.json({
            subscriptions,
            total: parseInt(countResult?.count || '0'),
            limit, offset,
            revenue
        });
    } catch (error) {
        log.error('Subscriptions list error', error);
        res.status(500).json({ error: 'Failed to load subscriptions' });
    }
});

// PATCH /api/admin/subscriptions/:id — override plan, limits, or status
router.patch('/:id', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const validated = updateSubscriptionSchema.parse(req.body);
        const { plan, status, events_limit, domains_limit } = validated;

        const updates: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (plan) { updates.push(`plan = $${idx++}`); params.push(plan); }
        if (status) { updates.push(`status = $${idx++}`); params.push(status); }
        if (events_limit !== undefined) { updates.push(`events_limit = $${idx++}`); params.push(events_limit); }
        if (domains_limit !== undefined) { updates.push(`domains_limit = $${idx++}`); params.push(domains_limit); }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        updates.push('updated_at = NOW()');
        params.push(req.params.id);

        const sub = await queryOne(
            `UPDATE subscriptions SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
            params
        );

        if (!sub) return res.status(404).json({ error: 'Subscription not found' });

        // Sync user subscription field
        if (plan) {
            await query(
                'UPDATE users SET subscription = $1 WHERE id = (SELECT user_id FROM subscriptions WHERE id = $2)',
                [plan, req.params.id]
            );
        }

        await logAction({
            adminId: req.userId!, action: 'subscription.update', targetType: 'subscription',
            targetId: req.params.id, details: validated, ipAddress: req.ip
        });

        res.json(sub);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        log.error('Subscription update error', error);
        res.status(500).json({ error: 'Failed to update subscription' });
    }
});

export default router;
