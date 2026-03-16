// Admin Dashboard Route — KPIs, charts, and overview statistics
import { Router, Response } from 'express';
import { adminAuth } from '../../middleware/adminAuth';
import { AuthRequest } from '../../middleware/auth';
import { query, queryOne } from '../../db';
import { createLogger } from '../../config/logger';

const log = createLogger('Admin:Dashboard');
const router = Router();

// GET /api/admin/dashboard/stats — overview KPIs
router.get('/stats', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const [
            usersCount,
            domainsCount,
            eventsToday,
            activeSubscriptions,
            recentSignups
        ] = await Promise.all([
            queryOne<{ count: string }>('SELECT COUNT(*) as count FROM users'),
            queryOne<{ count: string }>('SELECT COUNT(*) as count FROM domains'),
            queryOne<{ count: string }>(
                `SELECT COUNT(*) as count FROM events 
                 WHERE created_at >= CURRENT_DATE`
            ),
            queryOne<{ count: string }>(
                `SELECT COUNT(*) as count FROM subscriptions 
                 WHERE status = 'active' AND plan != 'free'`
            ),
            query(
                `SELECT id, name, email, subscription, role, created_at 
                 FROM users ORDER BY created_at DESC LIMIT 10`
            ),
        ]);

        // MRR calculation
        const mrr = await queryOne<{ total: string }>(
            `SELECT COALESCE(SUM(
                CASE plan 
                    WHEN 'pro' THEN 29 
                    WHEN 'agency' THEN 79 
                    ELSE 0 
                END
            ), 0) as total FROM subscriptions WHERE status = 'active'`
        );

        // Plan distribution
        const planDistribution = await query(
            `SELECT subscription as plan, COUNT(*) as count 
             FROM users GROUP BY subscription ORDER BY count DESC`
        );

        // Top domains by event volume
        const topDomains = await query(
            `SELECT d.domain, d.name, u.email as owner, COUNT(e.id) as events_count
             FROM domains d
             LEFT JOIN events e ON e.domain_id = d.id AND e.created_at >= NOW() - INTERVAL '30 days'
             LEFT JOIN users u ON d.user_id = u.id
             GROUP BY d.id, d.domain, d.name, u.email
             ORDER BY events_count DESC
             LIMIT 10`
        );

        res.json({
            stats: {
                totalUsers: parseInt(usersCount?.count || '0'),
                totalDomains: parseInt(domainsCount?.count || '0'),
                eventsToday: parseInt(eventsToday?.count || '0'),
                paidSubscriptions: parseInt(activeSubscriptions?.count || '0'),
                mrr: parseFloat(mrr?.total || '0'),
            },
            planDistribution,
            topDomains,
            recentSignups
        });
    } catch (error) {
        log.error('Dashboard stats error', error);
        res.status(500).json({ error: 'Failed to load dashboard stats' });
    }
});

// GET /api/admin/dashboard/charts — time-series data for charts
router.get('/charts', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const days = parseInt((req.query.days as string) || '30');

        // Signups per day
        const signups = await query(
            `SELECT DATE(created_at) as date, COUNT(*) as count
             FROM users
             WHERE created_at >= NOW() - INTERVAL '1 day' * $1
             GROUP BY DATE(created_at) ORDER BY date`,
            [days]
        );

        // Events per day
        const events = await query(
            `SELECT DATE(created_at) as date, COUNT(*) as count
             FROM events
             WHERE created_at >= NOW() - INTERVAL '1 day' * $1
             GROUP BY DATE(created_at) ORDER BY date`,
            [days]
        );

        // Sessions per day
        const sessions = await query(
            `SELECT DATE(started_at) as date, COUNT(*) as count
             FROM sessions
             WHERE started_at >= NOW() - INTERVAL '1 day' * $1
             GROUP BY DATE(started_at) ORDER BY date`,
            [days]
        );

        res.json({ signups, events, sessions });
    } catch (error) {
        log.error('Dashboard charts error', error);
        res.status(500).json({ error: 'Failed to load chart data' });
    }
});

// GET /api/admin/dashboard/actions — proactive action feed
router.get('/actions', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const [
            atLimit,
            overLimit,
            inactiveUsers,
            failedPayments,
            recentUpgrades,
        ] = await Promise.all([
            // Users using 85–99% of their event limit
            queryOne<{ count: string }>(`
                SELECT COUNT(*) as count FROM subscriptions s
                WHERE s.status = 'active'
                  AND s.events_limit > 0
                  AND (s.events_used::float / s.events_limit::float) >= 0.85
                  AND s.events_used < s.events_limit`),

            // Users who have exceeded their event limit
            queryOne<{ count: string }>(`
                SELECT COUNT(*) as count FROM subscriptions s
                WHERE s.status = 'active'
                  AND s.events_limit > 0
                  AND s.events_used >= s.events_limit`),

            // Users with domains but no events in 14+ days
            queryOne<{ count: string }>(`
                SELECT COUNT(DISTINCT u.id) as count
                FROM users u
                JOIN domains d ON d.user_id = u.id
                WHERE u.created_at <= NOW() - INTERVAL '3 days'
                  AND NOT EXISTS (
                      SELECT 1 FROM events e
                      WHERE e.domain_id = d.id
                        AND e.created_at >= NOW() - INTERVAL '14 days'
                  )`),

            // Subscriptions in past_due / unpaid state
            queryOne<{ count: string }>(`
                SELECT COUNT(*) as count FROM subscriptions
                WHERE status IN ('past_due', 'unpaid')`),

            // New paid subscriptions in last 7 days
            queryOne<{ count: string; mrr: string }>(`
                SELECT
                    COUNT(*) as count,
                    SUM(CASE plan
                        WHEN 'pro' THEN 29
                        WHEN 'agency' THEN 79
                        ELSE 0 END) as mrr
                FROM subscriptions
                WHERE status = 'active'
                  AND plan != 'free'
                  AND created_at >= NOW() - INTERVAL '7 days'`),
        ]);

        const actions: Array<{
            type: string;
            severity: 'info' | 'warning' | 'critical' | 'success';
            title: string;
            detail: string;
            count: number;
            link: string;
        }> = [];

        const overCount = parseInt(overLimit?.count || '0');
        const atCount   = parseInt(atLimit?.count || '0');
        const inactive  = parseInt(inactiveUsers?.count || '0');
        const failed    = parseInt(failedPayments?.count || '0');
        const upgraded  = parseInt(recentUpgrades?.count || '0');
        const newMrr    = parseFloat(recentUpgrades?.mrr || '0');

        if (overCount > 0) {
            actions.push({
                type: 'limit_exceeded',
                severity: 'critical',
                title: `${overCount} user${overCount > 1 ? 's have' : ' has'} exceeded their event limit`,
                detail: 'They are likely seeing errors. Consider reaching out or upgrading their plan.',
                count: overCount,
                link: '/subscriptions?status=active',
            });
        }

        if (failed > 0) {
            actions.push({
                type: 'failed_payments',
                severity: 'critical',
                title: `${failed} failed payment${failed > 1 ? 's' : ''}`,
                detail: 'Subscriptions in past_due or unpaid state. Revenue at risk.',
                count: failed,
                link: '/subscriptions?status=past_due',
            });
        }

        if (atCount > 0) {
            actions.push({
                type: 'limit_warning',
                severity: 'warning',
                title: `${atCount} user${atCount > 1 ? 's are' : ' is'} approaching their event limit`,
                detail: 'Using 85%+ of their plan quota. Good time to prompt an upgrade.',
                count: atCount,
                link: '/subscriptions',
            });
        }

        if (inactive > 0) {
            actions.push({
                type: 'inactive_users',
                severity: 'info',
                title: `${inactive} user${inactive > 1 ? 's' : ''} inactive for 14+ days`,
                detail: 'Have domains set up but no recent events. May need onboarding help.',
                count: inactive,
                link: '/users',
            });
        }

        if (upgraded > 0) {
            actions.push({
                type: 'recent_upgrades',
                severity: 'success',
                title: `${upgraded} new subscription${upgraded > 1 ? 's' : ''} this week`,
                detail: `+₦${newMrr.toLocaleString()} new MRR in the last 7 days.`,
                count: upgraded,
                link: '/subscriptions',
            });
        }

        res.json({ actions });
    } catch (error) {
        log.error('Dashboard actions error', error);
        res.status(500).json({ error: 'Failed to load action feed' });
    }
});

export default router;
