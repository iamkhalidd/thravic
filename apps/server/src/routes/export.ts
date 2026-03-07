import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireFeature } from '../middleware/featureGate';
import { query } from '../db';
import { z } from 'zod';
import { createLogger } from '../config/logger';

const log = createLogger('Export');

const router = express.Router();

const checkDomainOwnership = async (userId: string, domainId: string) => {
    const result = await query(
        'SELECT id FROM domains WHERE id = $1 AND user_id = $2',
        [domainId, userId]
    );
    return result.length > 0;
};

// GET /api/export/:domainId?type=sessions
router.get('/:domainId', authenticate, requireFeature('export'), async (req: AuthRequest, res) => {
    try {
        const { domainId } = req.params;
        const { type = 'sessions' } = req.query; // sessions or events
        const userId = req.userId!;


        // Check ownership
        const isOwner = await checkDomainOwnership(userId, domainId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Access denied to this domain' });
        }

        // Set headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="thravic-${type}-${domainId}.csv"`);

        if (type === 'sessions') {
            const sessions = await query(
                `SELECT session_id, visitor_id, started_at, ended_at, source, source_type, 
                        utm_source, user_agent, screen_width, language 
                 FROM sessions 
                 WHERE domain_id = $1 
                 ORDER BY started_at DESC 
                 LIMIT 10000`, // Limit for safety
                [domainId]
            );

            // Write CSV Header
            res.write('Session ID,Visitor ID,Started At,Ended At,Source,Source Type,UTM Source,User Agent,Screen Width,Language\n');

            // Write Rows
            for (const s of sessions) {
                const row = [
                    s.session_id,
                    s.visitor_id,
                    s.started_at,
                    s.ended_at || '',
                    s.source || '',
                    s.source_type || '',
                    s.utm_source || '',
                    `"${(s.user_agent || '').replace(/"/g, '""')}"`, // Escape quotes
                    s.screen_width || '',
                    s.language || ''
                ].join(',');
                res.write(row + '\n');
            }

        } else if (type === 'events') {
            const events = await query(
                `SELECT type, url, referrer, created_at 
                 FROM events 
                 WHERE domain_id = $1 
                 ORDER BY created_at DESC 
                 LIMIT 10000`,
                [domainId]
            );

            res.write('Type,URL,Referrer,Created At\n');
            for (const e of events) {
                const row = [
                    e.type,
                    `"${(e.url || '').replace(/"/g, '""')}"`,
                    `"${(e.referrer || '').replace(/"/g, '""')}"`,
                    e.created_at
                ].join(',');
                res.write(row + '\n');
            }
        }

        res.end();

    } catch (error) {
        log.error('Export error', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

export default router;
