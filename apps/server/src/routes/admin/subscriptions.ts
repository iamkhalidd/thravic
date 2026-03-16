// Admin Subscriptions Route — Billing and plan management
import { Router, Response } from 'express';
import { adminAuth } from '../../middleware/adminAuth';
import { AuthRequest } from '../../middleware/auth';
import { query, queryOne } from '../../db';
import { logAction } from '../../services/auditService';
import { createLogger } from '../../config/logger';
import { updateSubscriptionSchema } from '../../validators/admin';
import { z } from 'zod';
import axios from 'axios';

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

// POST /api/admin/subscriptions/:id/cancel — cancels subscription at Paystack
router.post('/:id/cancel', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const sub = await queryOne('SELECT * FROM subscriptions WHERE id = $1', [req.params.id]);
        if (!sub) return res.status(404).json({ error: 'Subscription not found' });

        const user = await queryOne('SELECT * FROM users WHERE id = $1', [sub.user_id]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const subCode = user.paystack_subscription_code;
        
        if (subCode) {
            log.info(`Canceling Paystack subscription for sub ${req.params.id}, code ${subCode}`);
            const secret = process.env.PAYSTACK_SECRET_KEY;
            if (!secret) throw new Error('PAYSTACK_SECRET_KEY is missing');

            try {
                // Call Paystack disable subscription endpoint
                // We need the email and sub code, but Paystack's disable endpoint 
                // requires only code and token. Wait, actually POST to /subscription/disable
                // needs { code, token }. We only have code. Let's check Paystack docs.
                // Wait, it requires the code and the email.
                // Paystack disable requires POST with JSON { "code": "sub_code", "token": "user_email_token" } 
                // Ah, according to Paystack docs, it requires "code" AND "token". Let's fetch the subscription details first from Paystack to get the email token if needed, or simply let the frontend do it? The backend should do it.
                // Paystack actually accepts POST /subscription/disable with JSON { "code": subCode, "token": emailToken }.
                // If we don't have the token, we can just GET /subscription/:id_or_code to get it.
                const paystackSub = await axios.get(`https://api.paystack.co/subscription/${subCode}`, {
                    headers: { 'Authorization': `Bearer ${secret}` }
                });
                const token = paystackSub.data.data.email_token;

                await axios.post('https://api.paystack.co/subscription/disable', {
                    code: subCode,
                    token: token
                }, {
                    headers: { 'Authorization': `Bearer ${secret}` }
                });
                log.info('Paystack subscription disabled successfully');
            } catch (err: any) {
                log.error('Failed to disable at Paystack', err.response?.data || err.message);
                // Return 500 if we strictly want to ensure Paystack sync, but maybe we just want to force local db cancel?
                return res.status(500).json({ error: err.response?.data?.message || 'Failed to cancel at Paystack' });
            }
        }

        // Cancel locally
        await query('UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE id = $2', ['canceled', req.params.id]);
        await query('UPDATE users SET subscription = $1, paystack_subscription_code = NULL WHERE id = $2', ['free', sub.user_id]);

        await logAction({
            adminId: req.userId!, action: 'subscription.cancel', targetType: 'subscription',
            targetId: req.params.id, ipAddress: req.ip
        });

        res.json({ message: 'Subscription canceled successfully' });
    } catch (error) {
        log.error('Subscription cancel error', error);
        res.status(500).json({ error: 'Failed to cancel subscription' });
    }
});

export default router;
