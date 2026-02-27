// Admin Retention Route — Data retention policy management
import { Router, Response } from 'express';
import { adminAuth } from '../../middleware/adminAuth';
import { AuthRequest } from '../../middleware/auth';
import { query, queryOne } from '../../db';
import { logAction } from '../../services/auditService';
import { createLogger } from '../../config/logger';

const log = createLogger('Admin:Retention');
const router = Router();

// GET /api/admin/retention — list all retention policies
router.get('/', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const policies = await query(
            'SELECT * FROM data_retention_policies ORDER BY events_days ASC'
        );

        // Calculate how much data would be cleaned per policy
        const stats = await Promise.all(
            policies.map(async (p: any) => {
                const expiredEvents = await queryOne<{ count: string }>(
                    `SELECT COUNT(*) as count FROM events e
                     JOIN domains d ON e.domain_id = d.id
                     JOIN users u ON d.user_id = u.id
                     WHERE u.subscription = $1
                     AND e.created_at < NOW() - INTERVAL '1 day' * $2`,
                    [p.plan, p.events_days]
                );
                return {
                    ...p,
                    expiredEventsCount: parseInt(expiredEvents?.count || '0')
                };
            })
        );

        res.json({ policies: stats });
    } catch (error) {
        log.error('Retention list error', error);
        res.status(500).json({ error: 'Failed to load retention policies' });
    }
});

// PUT /api/admin/retention/:plan — update retention policy for a plan
router.put('/:plan', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { events_days, sessions_days, recordings_days, heatmaps_days } = req.body;

        const policy = await queryOne(
            `UPDATE data_retention_policies 
             SET events_days = COALESCE($1, events_days),
                 sessions_days = COALESCE($2, sessions_days),
                 recordings_days = COALESCE($3, recordings_days),
                 heatmaps_days = COALESCE($4, heatmaps_days)
             WHERE plan = $5
             RETURNING *`,
            [events_days, sessions_days, recordings_days, heatmaps_days, req.params.plan]
        );

        if (!policy) return res.status(404).json({ error: 'Plan not found' });

        await logAction({
            adminId: req.userId!, action: 'retention.update', targetType: 'retention',
            details: { plan: req.params.plan, ...req.body }, ipAddress: req.ip
        });

        res.json(policy);
    } catch (error) {
        log.error('Retention update error', error);
        res.status(500).json({ error: 'Failed to update retention policy' });
    }
});

// POST /api/admin/retention/cleanup — manually trigger data cleanup
router.post('/cleanup', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const policies = await query('SELECT * FROM data_retention_policies');
        const results: Record<string, number> = {};

        for (const p of policies as any[]) {
            // Delete expired events
            const eventsResult = await query(
                `DELETE FROM events WHERE id IN (
                    SELECT e.id FROM events e
                    JOIN domains d ON e.domain_id = d.id
                    JOIN users u ON d.user_id = u.id
                    WHERE u.subscription = $1
                    AND e.created_at < NOW() - INTERVAL '1 day' * $2
                ) RETURNING id`,
                [p.plan, p.events_days]
            );

            // Delete expired sessions
            const sessionsResult = await query(
                `DELETE FROM sessions WHERE id IN (
                    SELECT s.id FROM sessions s
                    JOIN domains d ON s.domain_id = d.id
                    JOIN users u ON d.user_id = u.id
                    WHERE u.subscription = $1
                    AND s.started_at < NOW() - INTERVAL '1 day' * $2
                ) RETURNING id`,
                [p.plan, p.sessions_days]
            );

            // Delete expired recordings
            const recordingsResult = await query(
                `DELETE FROM session_recordings WHERE id IN (
                    SELECT sr.id FROM session_recordings sr
                    JOIN domains d ON sr.domain_id = d.id
                    JOIN users u ON d.user_id = u.id
                    WHERE u.subscription = $1
                    AND sr.started_at < NOW() - INTERVAL '1 day' * $2
                ) RETURNING id`,
                [p.plan, p.recordings_days]
            );

            // Delete expired heatmaps
            const heatmapsResult = await query(
                `DELETE FROM heatmap_data WHERE id IN (
                    SELECT h.id FROM heatmap_data h
                    JOIN domains d ON h.domain_id = d.id
                    JOIN users u ON d.user_id = u.id
                    WHERE u.subscription = $1
                    AND h.created_at < NOW() - INTERVAL '1 day' * $2
                ) RETURNING id`,
                [p.plan, p.heatmaps_days]
            );

            results[p.plan] = {
                events: (eventsResult as any[]).length,
                sessions: (sessionsResult as any[]).length,
                recordings: (recordingsResult as any[]).length,
                heatmaps: (heatmapsResult as any[]).length
            } as any;
        }

        await logAction({
            adminId: req.userId!, action: 'retention.cleanup', targetType: 'system',
            details: { results }, ipAddress: req.ip
        });

        res.json({ message: 'Cleanup completed', results });
    } catch (error) {
        log.error('Cleanup error', error);
        res.status(500).json({ error: 'Failed to run cleanup' });
    }
});

export default router;
