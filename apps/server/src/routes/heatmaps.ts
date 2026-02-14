import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import * as domainService from '../services/domainService';
import * as eventService from '../services/eventService';

const router = Router();

// GET /api/heatmaps/:domainId - Get heatmap data for a page
router.get('/:domainId', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const pageUrl = req.query.page as string;
        const type = (req.query.type as string) || 'click';

        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Get click/scroll events for the specified page
        const events = await eventService.queryByDomain(
            domain.id, startDate, endDate, type
        );

        // Filter by page URL if specified
        const filtered = pageUrl
            ? events.filter(e => {
                try { return new URL(e.url).pathname === pageUrl; }
                catch { return e.url === pageUrl; }
            })
            : events;

        // Aggregate into heatmap points
        const pointMap: Record<string, { x: number; y: number; count: number }> = {};
        for (const event of filtered) {
            const data = event.data as Record<string, any> | null;
            if (data?.x != null && data?.y != null) {
                const key = `${Math.round(data.x)},${Math.round(data.y)}`;
                if (!pointMap[key]) {
                    pointMap[key] = { x: Math.round(data.x), y: Math.round(data.y), count: 0 };
                }
                pointMap[key].count++;
            }
        }

        const points = Object.values(pointMap).sort((a, b) => b.count - a.count);

        res.json({
            domainId: domain.id,
            pageUrl: pageUrl || 'all',
            type,
            points,
            totalInteractions: filtered.length,
            uniqueVisitors: new Set(filtered.map(e => e.visitor_id)).size,
            period: { start: startDate, end: endDate }
        });
    } catch (error) {
        console.error('Heatmap error:', error);
        res.status(500).json({ error: 'Failed to get heatmap data' });
    }
});

// GET /api/heatmaps/:domainId/pages - List pages with heatmap data
router.get('/:domainId/pages', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Get click events grouped by page
        const events = await eventService.queryByDomain(domain.id, startDate, endDate, 'click');

        const pageMap: Record<string, { clicks: number; visitors: Set<string | null> }> = {};
        for (const e of events) {
            try {
                const path = new URL(e.url).pathname;
                if (!pageMap[path]) {
                    pageMap[path] = { clicks: 0, visitors: new Set() };
                }
                pageMap[path].clicks++;
                pageMap[path].visitors.add(e.visitor_id);
            } catch { /* skip invalid URLs */ }
        }

        const pages = Object.entries(pageMap)
            .map(([path, data]) => ({
                path,
                clicks: data.clicks,
                visitors: data.visitors.size,
            }))
            .sort((a, b) => b.clicks - a.clicks)
            .slice(0, 20);

        res.json({ pages });
    } catch (error) {
        console.error('Heatmap pages error:', error);
        res.status(500).json({ error: 'Failed to get heatmap pages' });
    }
});

export default router;
