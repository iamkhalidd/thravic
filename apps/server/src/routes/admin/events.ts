// Admin Events Route — Event explorer and bulk operations
import { Router, Response } from 'express';
import { adminAuth } from '../../middleware/adminAuth';
import { AuthRequest } from '../../middleware/auth';
import { query, queryOne } from '../../db';
import { logAction } from '../../services/auditService';
import { createLogger } from '../../config/logger';
import { purgeEventsSchema } from '../../validators/admin';
import { z } from 'zod';

const log = createLogger('Admin:Events');
const router = Router();

// GET /api/admin/events — paginated event stream with filters
router.get('/', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const domainId = req.query.domainId || '';
        const type = req.query.type || '';
        const url = req.query.url || '';
        const limit = Math.min(parseInt((req.query.limit as string) || '50'), 200);
        const offset = parseInt((req.query.offset as string) || '0');

        const conditions: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (domainId) { conditions.push(`e.domain_id = $${idx++}`); params.push(domainId); }
        if (type) { conditions.push(`e.type = $${idx++}`); params.push(type); }
        if (url) { conditions.push(`e.url ILIKE $${idx++}`); params.push(`%${url}%`); }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const events = await query(
            `SELECT e.*, d.domain as domain_name
             FROM events e
             LEFT JOIN domains d ON e.domain_id = d.id
             ${where}
             ORDER BY e.created_at DESC
             LIMIT $${idx++} OFFSET $${idx++}`,
            [...params, limit, offset]
        );

        const countResult = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM events e ${where}`,
            params
        );

        res.json({ events, total: parseInt(countResult?.count || '0'), limit, offset });
    } catch (error) {
        log.error('Events list error', error);
        res.status(500).json({ error: 'Failed to load events' });
    }
});

// DELETE /api/admin/events/purge — bulk delete events
router.delete('/purge', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const validated = purgeEventsSchema.parse(req.body);
        const { domainId, before, type } = validated;

        const conditions: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (domainId) { conditions.push(`domain_id = $${idx++}`); params.push(domainId); }
        if (before) { conditions.push(`created_at < $${idx++}`); params.push(before); }
        if (type) { conditions.push(`type = $${idx++}`); params.push(type); }

        const where = conditions.join(' AND ');

        const countBefore = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM events WHERE ${where}`,
            params
        );

        await query(`DELETE FROM events WHERE ${where}`, params);

        const deleted = parseInt(countBefore?.count || '0');

        await logAction({
            adminId: req.userId!, action: 'events.purge', targetType: 'events',
            details: { domainId, before, type, deletedCount: deleted }, ipAddress: req.ip
        });

        res.json({ message: `Purged ${deleted} events`, deleted });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        log.error('Events purge error', error);
        res.status(500).json({ error: 'Failed to purge events' });
    }
});

export default router;
