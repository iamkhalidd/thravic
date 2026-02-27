// Admin Domains Route — Domain management across all users
import { Router, Response } from 'express';
import { adminAuth } from '../../middleware/adminAuth';
import { AuthRequest } from '../../middleware/auth';
import { query, queryOne } from '../../db';
import { logAction } from '../../services/auditService';
import { createLogger } from '../../config/logger';
import { updateAdminDomainSchema, transferDomainSchema } from '../../validators/admin';
import { z } from 'zod';

const log = createLogger('Admin:Domains');
const router = Router();

// GET /api/admin/domains — list all domains
router.get('/', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const search = req.query.search || '';
        const limit = Math.min(parseInt((req.query.limit as string) || '25'), 100);
        const offset = parseInt((req.query.offset as string) || '0');

        const conditions: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (search) {
            conditions.push(`(d.domain ILIKE $${idx} OR d.name ILIKE $${idx} OR u.email ILIKE $${idx})`);
            params.push(`%${search}%`);
            idx++;
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const domains = await query(
            `SELECT d.*, u.email as owner_email, u.name as owner_name,
                    COUNT(DISTINCT e.id) as events_30d,
                    COUNT(DISTINCT dm.id) as members_count
             FROM domains d
             LEFT JOIN users u ON d.user_id = u.id
             LEFT JOIN events e ON e.domain_id = d.id AND e.created_at >= NOW() - INTERVAL '30 days'
             LEFT JOIN domain_members dm ON dm.domain_id = d.id
             ${where}
             GROUP BY d.id, u.email, u.name
             ORDER BY d.created_at DESC
             LIMIT $${idx++} OFFSET $${idx++}`,
            [...params, limit, offset]
        );

        const countResult = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM domains d LEFT JOIN users u ON d.user_id = u.id ${where}`,
            params
        );

        res.json({ domains, total: parseInt(countResult?.count || '0'), limit, offset });
    } catch (error) {
        log.error('Domains list error', error);
        res.status(500).json({ error: 'Failed to load domains' });
    }
});

// GET /api/admin/domains/:id — domain detail
router.get('/:id', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await queryOne(
            `SELECT d.*, u.email as owner_email, u.name as owner_name
             FROM domains d LEFT JOIN users u ON d.user_id = u.id
             WHERE d.id = $1`,
            [req.params.id]
        );

        if (!domain) return res.status(404).json({ error: 'Domain not found' });

        const members = await query(
            `SELECT u.id, u.name, u.email, dm.role, dm.created_at
             FROM domain_members dm JOIN users u ON dm.user_id = u.id
             WHERE dm.domain_id = $1`,
            [req.params.id]
        );

        const funnels = await query(
            'SELECT id, name, created_at FROM funnels WHERE domain_id = $1',
            [req.params.id]
        );

        const webhooks = await query(
            'SELECT id, url, events, enabled FROM webhooks WHERE domain_id = $1',
            [req.params.id]
        );

        res.json({ domain, members, funnels, webhooks });
    } catch (error) {
        log.error('Domain detail error', error);
        res.status(500).json({ error: 'Failed to load domain' });
    }
});

// PATCH /api/admin/domains/:id — update domain
router.patch('/:id', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const validated = updateAdminDomainSchema.parse(req.body);
        const { name, verified } = validated;

        const updates: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
        if (verified !== undefined) { updates.push(`verified = $${idx++}`); params.push(verified); }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        params.push(req.params.id);
        const domain = await queryOne(
            `UPDATE domains SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
            params
        );

        await logAction({
            adminId: req.userId!, action: 'domain.update', targetType: 'domain',
            targetId: req.params.id, details: validated, ipAddress: req.ip
        });

        res.json(domain);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        log.error('Domain update error', error);
        res.status(500).json({ error: 'Failed to update domain' });
    }
});

// POST /api/admin/domains/:id/transfer — transfer domain to another user
router.post('/:id/transfer', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { newUserId } = transferDomainSchema.parse(req.body);

        const newOwner = await queryOne('SELECT id FROM users WHERE id = $1', [newUserId]);
        if (!newOwner) return res.status(404).json({ error: 'Target user not found' });

        await query('UPDATE domains SET user_id = $1 WHERE id = $2', [newUserId, req.params.id]);

        await logAction({
            adminId: req.userId!, action: 'domain.transfer', targetType: 'domain',
            targetId: req.params.id, details: { newUserId }, ipAddress: req.ip
        });

        res.json({ message: 'Domain transferred successfully' });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        log.error('Domain transfer error', error);
        res.status(500).json({ error: 'Failed to transfer domain' });
    }
});

// DELETE /api/admin/domains/:id — delete domain + cascade
router.delete('/:id', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await queryOne<{ domain: string }>('SELECT domain FROM domains WHERE id = $1', [req.params.id]);
        if (!domain) return res.status(404).json({ error: 'Domain not found' });

        await query('DELETE FROM domains WHERE id = $1', [req.params.id]);

        await logAction({
            adminId: req.userId!, action: 'domain.delete', targetType: 'domain',
            targetId: req.params.id, details: { domain: domain.domain }, ipAddress: req.ip
        });

        res.json({ message: 'Domain deleted' });
    } catch (error) {
        log.error('Domain delete error', error);
        res.status(500).json({ error: 'Failed to delete domain' });
    }
});

export default router;
