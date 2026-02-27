// Admin Export Route — Data export for GDPR/admin purposes
import { Router, Response } from 'express';
import { adminAuth } from '../../middleware/adminAuth';
import { AuthRequest } from '../../middleware/auth';
import { query, queryOne } from '../../db';
import { logAction } from '../../services/auditService';
import { createLogger } from '../../config/logger';

const log = createLogger('Admin:Export');
const router = Router();

// POST /api/admin/export/user/:id — export all data for a user (GDPR)
router.post('/user/:id', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.params.id;

        const user = await queryOne(
            'SELECT id, name, email, subscription, role, created_at FROM users WHERE id = $1',
            [userId]
        );

        if (!user) return res.status(404).json({ error: 'User not found' });

        const domains = await query(
            'SELECT * FROM domains WHERE user_id = $1',
            [userId]
        );

        const domainIds = (domains as any[]).map(d => d.id);
        let events: any[] = [];
        let sessions: any[] = [];
        let recordings: any[] = [];

        if (domainIds.length > 0) {
            const placeholders = domainIds.map((_, i) => `$${i + 1}`).join(',');

            events = await query(
                `SELECT id, domain_id, type, url, data, created_at 
                 FROM events WHERE domain_id IN (${placeholders}) 
                 ORDER BY created_at DESC LIMIT 10000`,
                domainIds
            );

            sessions = await query(
                `SELECT id, session_id, domain_id, started_at, ended_at, pageviews,
                        source, source_type, country, city
                 FROM sessions WHERE domain_id IN (${placeholders})
                 ORDER BY started_at DESC LIMIT 5000`,
                domainIds
            );

            recordings = await query(
                `SELECT id, domain_id, url, duration, events_count, started_at
                 FROM session_recordings WHERE domain_id IN (${placeholders})
                 ORDER BY started_at DESC LIMIT 1000`,
                domainIds
            );
        }

        const subscription = await queryOne(
            'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
            [userId]
        );

        await logAction({
            adminId: req.userId!, action: 'export.user', targetType: 'user',
            targetId: userId, ipAddress: req.ip
        });

        res.json({
            exportDate: new Date().toISOString(),
            user,
            subscription,
            domains,
            events: { count: events.length, data: events },
            sessions: { count: sessions.length, data: sessions },
            recordings: { count: recordings.length, data: recordings }
        });
    } catch (error) {
        log.error('User export error', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

// POST /api/admin/export/domain/:id — export domain data
router.post('/domain/:id', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const domainId = req.params.id;
        const format = req.query.format || 'json';

        const domain = await queryOne('SELECT * FROM domains WHERE id = $1', [domainId]);
        if (!domain) return res.status(404).json({ error: 'Domain not found' });

        const events = await query(
            `SELECT * FROM events WHERE domain_id = $1 ORDER BY created_at DESC LIMIT 50000`,
            [domainId]
        );

        const sessions = await query(
            `SELECT * FROM sessions WHERE domain_id = $1 ORDER BY started_at DESC LIMIT 10000`,
            [domainId]
        );

        const visitors = await query(
            `SELECT * FROM visitors WHERE domain_id = $1`,
            [domainId]
        );

        await logAction({
            adminId: req.userId!, action: 'export.domain', targetType: 'domain',
            targetId: domainId, ipAddress: req.ip
        });

        if (format === 'csv') {
            // Simple CSV export for events
            const csvHeader = 'id,type,url,created_at\n';
            const csvRows = (events as any[])
                .map(e => `${e.id},${e.type},"${e.url}",${e.created_at}`)
                .join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=domain_${domainId}_events.csv`);
            return res.send(csvHeader + csvRows);
        }

        res.json({
            exportDate: new Date().toISOString(),
            domain,
            events: { count: events.length, data: events },
            sessions: { count: sessions.length, data: sessions },
            visitors: { count: visitors.length, data: visitors }
        });
    } catch (error) {
        log.error('Domain export error', error);
        res.status(500).json({ error: 'Failed to export domain data' });
    }
});

export default router;
