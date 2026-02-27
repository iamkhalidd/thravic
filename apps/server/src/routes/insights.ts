import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireFeature } from '../middleware/featureGate';
import * as domainService from '../services/domainService';
import * as eventService from '../services/eventService';
import * as sessionService from '../services/sessionService';
import { createLogger } from '../config/logger';

const log = createLogger('Insights');
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Helper: Calculate percent change
function percentChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
}

// GET /api/insights/:domainId - Get AI-generated insights
router.get('/:domainId', authenticate, requireFeature('insights'), async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        // Current period (last 7 days)
        const now = new Date();
        const currentEnd = now;
        const currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        // Previous period (7-14 days ago)
        const previousEnd = currentStart;
        const previousStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        // Fetch current and previous period data
        const [
            currentPageviews,
            previousPageviews,
            currentVisitors,
            previousVisitors,
            currentSessions,
            previousSessions,
            currentBounceRate,
            previousBounceRate,
            currentAvgDuration,
            previousAvgDuration,
        ] = await Promise.all([
            eventService.countByDomain(domain.id, currentStart, currentEnd, 'pageview'),
            eventService.countByDomain(domain.id, previousStart, previousEnd, 'pageview'),
            eventService.countUniqueVisitors(domain.id, currentStart, currentEnd),
            eventService.countUniqueVisitors(domain.id, previousStart, previousEnd),
            sessionService.countByDomain(domain.id, currentStart, currentEnd),
            sessionService.countByDomain(domain.id, previousStart, previousEnd),
            sessionService.getBounceRate(domain.id, currentStart, currentEnd),
            sessionService.getBounceRate(domain.id, previousStart, previousEnd),
            sessionService.getAvgDuration(domain.id, currentStart, currentEnd),
            sessionService.getAvgDuration(domain.id, previousStart, previousEnd),
        ]);

        const insights: any[] = [];

        // Traffic trend
        const pvChange = percentChange(currentPageviews, previousPageviews);
        if (Math.abs(pvChange) >= 10) {
            insights.push({
                id: uuidv4(),
                type: pvChange > 0 ? 'trend' : 'warning',
                priority: Math.abs(pvChange) > 50 ? 'high' : 'medium',
                title: pvChange > 0 ? 'Traffic is growing' : 'Traffic is declining',
                description: `Pageviews ${pvChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(pvChange)}% compared to the previous week.`,
                metric: 'pageviews',
                value: currentPageviews,
                change: pvChange,
                recommendation: pvChange < 0
                    ? 'Investigate potential causes — check for technical issues, content changes, or SEO ranking drops.'
                    : 'Great momentum! Consider doubling down on what\'s working.',
                createdAt: new Date()
            });
        }

        // Visitor trend
        const visitorChange = percentChange(currentVisitors, previousVisitors);
        if (Math.abs(visitorChange) >= 15) {
            insights.push({
                id: uuidv4(),
                type: visitorChange > 0 ? 'opportunity' : 'anomaly',
                priority: 'medium',
                title: visitorChange > 0 ? 'New visitor surge' : 'Fewer unique visitors',
                description: `Unique visitors ${visitorChange > 0 ? 'grew' : 'dropped'} by ${Math.abs(visitorChange)}%.`,
                metric: 'visitors',
                value: currentVisitors,
                change: visitorChange,
                createdAt: new Date()
            });
        }

        // Bounce rate
        if (currentBounceRate > 70) {
            insights.push({
                id: uuidv4(),
                type: 'performance',
                priority: 'high',
                title: 'High bounce rate detected',
                description: `Your bounce rate is ${currentBounceRate}%, which is above the recommended threshold.`,
                metric: 'bounceRate',
                value: `${currentBounceRate}%`,
                change: percentChange(currentBounceRate, previousBounceRate),
                recommendation: 'Improve page load speed, review landing page content, and ensure your CTAs are compelling.',
                createdAt: new Date()
            });
        }

        // Session duration
        if (currentAvgDuration < 30 && currentSessions > 0) {
            insights.push({
                id: uuidv4(),
                type: 'performance',
                priority: 'medium',
                title: 'Low session duration',
                description: `Average session is only ${currentAvgDuration} seconds. Visitors may not be finding what they need.`,
                metric: 'avgSessionDuration',
                value: `${currentAvgDuration}s`,
                change: percentChange(currentAvgDuration, previousAvgDuration),
                recommendation: 'Add more engaging content, improve navigation, and consider internal linking.',
                createdAt: new Date()
            });
        }

        // If no insights, add a default one
        if (insights.length === 0) {
            insights.push({
                id: uuidv4(),
                type: 'trend',
                priority: 'low',
                title: 'Steady performance',
                description: 'Your metrics are stable this week. No significant changes detected.',
                metric: 'overall',
                value: 'stable',
                createdAt: new Date()
            });
        }

        res.json({
            insights,
            period: {
                current: { start: currentStart, end: currentEnd },
                previous: { start: previousStart, end: previousEnd }
            },
            generatedAt: new Date()
        });
    } catch (error) {
        log.error('Insights error', error);
        res.status(500).json({ error: 'Failed to generate insights' });
    }
});

export default router;
