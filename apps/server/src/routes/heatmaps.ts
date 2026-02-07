import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { domains } from './domains';
import { events } from './collect';

const router = Router();

// In-memory heatmap data storage
interface HeatmapPoint {
    x: number;
    y: number;
    count: number;
}

interface HeatmapData {
    id: string;
    domainId: string;
    pageUrl: string;
    pagePath: string;
    type: 'click' | 'scroll';
    viewport: 'desktop' | 'mobile' | 'tablet';
    points: HeatmapPoint[];
    totalInteractions: number;
    uniqueVisitors: number;
    updatedAt: Date;
}

// In-memory cache for aggregated heatmap data
const heatmapCache: Map<string, HeatmapData> = new Map();

// Determine viewport type
function getViewportType(width: number): 'desktop' | 'mobile' | 'tablet' {
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
}

// Normalize coordinates to percentage (0-100)
function normalizeCoordinate(value: number, max: number): number {
    return Math.round((value / max) * 100);
}

// Generate cache key
function getCacheKey(domainId: string, pagePath: string, type: string, viewport: string): string {
    return `${domainId}:${pagePath}:${type}:${viewport}`;
}

// Aggregate click events into heatmap data
function aggregateClickHeatmap(
    domainEvents: any[],
    pagePath: string,
    viewport: 'desktop' | 'mobile' | 'tablet',
    startDate: Date,
    endDate: Date
): HeatmapData {
    const clickEvents = domainEvents.filter(e => {
        if (e.type !== 'click') return false;
        if (e.timestamp < startDate || e.timestamp > endDate) return false;

        try {
            const eventPath = new URL(e.url).pathname;
            if (eventPath !== pagePath) return false;
        } catch {
            return false;
        }

        // Filter by viewport
        const eventViewport = getViewportType(e.screenWidth || 1920);
        if (eventViewport !== viewport) return false;

        return true;
    });

    // Aggregate clicks into grid cells (10x10 grid = 100 cells)
    const gridSize = 10;
    const grid: Map<string, { count: number; visitors: Set<string> }> = new Map();
    const allVisitors = new Set<string>();

    for (const event of clickEvents) {
        const data = event.data || {};
        if (typeof data.x !== 'number' || typeof data.y !== 'number') continue;

        allVisitors.add(event.visitorId);

        // Normalize to viewport width/height percentage
        const screenWidth = event.screenWidth || 1920;
        const screenHeight = event.screenHeight || 1080;

        const xPercent = normalizeCoordinate(data.x, screenWidth);
        const yPercent = normalizeCoordinate(data.y, screenHeight);

        // Map to grid cell
        const gridX = Math.min(Math.floor(xPercent / gridSize), gridSize - 1);
        const gridY = Math.min(Math.floor(yPercent / gridSize), gridSize - 1);
        const cellKey = `${gridX},${gridY}`;

        const cell = grid.get(cellKey) || { count: 0, visitors: new Set() };
        cell.count++;
        cell.visitors.add(event.visitorId);
        grid.set(cellKey, cell);
    }

    // Convert grid to points
    const points: HeatmapPoint[] = [];
    for (const [key, cell] of grid) {
        const [x, y] = key.split(',').map(Number);
        points.push({
            x: x * gridSize + gridSize / 2, // Center of cell
            y: y * gridSize + gridSize / 2,
            count: cell.count
        });
    }

    return {
        id: `${pagePath}:${viewport}:click`,
        domainId: '',
        pageUrl: pagePath,
        pagePath,
        type: 'click',
        viewport,
        points,
        totalInteractions: clickEvents.length,
        uniqueVisitors: allVisitors.size,
        updatedAt: new Date()
    };
}

// Aggregate scroll events into scroll depth data
function aggregateScrollHeatmap(
    domainEvents: any[],
    pagePath: string,
    viewport: 'desktop' | 'mobile' | 'tablet',
    startDate: Date,
    endDate: Date
): HeatmapData {
    const scrollEvents = domainEvents.filter(e => {
        if (e.type !== 'scroll') return false;
        if (e.timestamp < startDate || e.timestamp > endDate) return false;

        try {
            const eventPath = new URL(e.url).pathname;
            if (eventPath !== pagePath) return false;
        } catch {
            return false;
        }

        const eventViewport = getViewportType(e.screenWidth || 1920);
        if (eventViewport !== viewport) return false;

        return true;
    });

    // Track max scroll depth per visitor
    const visitorScrollDepth: Map<string, number> = new Map();

    for (const event of scrollEvents) {
        const depth = event.data?.depth || 0;
        const currentMax = visitorScrollDepth.get(event.visitorId) || 0;
        visitorScrollDepth.set(event.visitorId, Math.max(currentMax, depth));
    }

    // Calculate how many visitors reached each depth level
    const depthLevels = [0, 25, 50, 75, 100];
    const points: HeatmapPoint[] = depthLevels.map(depth => {
        const visitorsAtDepth = Array.from(visitorScrollDepth.values())
            .filter(d => d >= depth).length;

        return {
            x: 50, // Center horizontally
            y: depth,
            count: visitorsAtDepth
        };
    });

    return {
        id: `${pagePath}:${viewport}:scroll`,
        domainId: '',
        pageUrl: pagePath,
        pagePath,
        type: 'scroll',
        viewport,
        points,
        totalInteractions: scrollEvents.length,
        uniqueVisitors: visitorScrollDepth.size,
        updatedAt: new Date()
    };
}

// GET /api/heatmaps/:domainId/pages - List pages with heatmap data
router.get('/:domainId/pages', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    // Get unique pages with click/scroll events
    const domainEvents = events.filter(e =>
        e.trackingId === domain.trackingId &&
        (e.type === 'click' || e.type === 'scroll')
    );

    const pageStats: Map<string, { clicks: number; scrolls: number; visitors: Set<string> }> = new Map();

    for (const event of domainEvents) {
        try {
            const pagePath = new URL(event.url).pathname;
            const stats = pageStats.get(pagePath) || { clicks: 0, scrolls: 0, visitors: new Set() };

            if (event.type === 'click') stats.clicks++;
            if (event.type === 'scroll') stats.scrolls++;
            stats.visitors.add(event.visitorId);

            pageStats.set(pagePath, stats);
        } catch {
            continue;
        }
    }

    const pages = Array.from(pageStats.entries())
        .map(([path, stats]) => ({
            path,
            clicks: stats.clicks,
            scrolls: stats.scrolls,
            visitors: stats.visitors.size
        }))
        .sort((a, b) => b.clicks - a.clicks);

    res.json({ pages });
});

// GET /api/heatmaps/:domainId/click - Get click heatmap for a page
router.get('/:domainId/click', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const pagePath = req.query.page as string;
    const viewport = (req.query.viewport as string || 'desktop') as 'desktop' | 'mobile' | 'tablet';

    if (!pagePath) {
        return res.status(400).json({ error: 'Page path required' });
    }

    const endDate = req.query.end ? new Date(req.query.end as string) : new Date();
    const startDate = req.query.start
        ? new Date(req.query.start as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const domainEvents = events.filter(e => e.trackingId === domain.trackingId);
    const heatmapData = aggregateClickHeatmap(domainEvents, pagePath, viewport, startDate, endDate);

    res.json({
        ...heatmapData,
        period: { start: startDate, end: endDate }
    });
});

// GET /api/heatmaps/:domainId/scroll - Get scroll depth heatmap
router.get('/:domainId/scroll', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const pagePath = req.query.page as string;
    const viewport = (req.query.viewport as string || 'desktop') as 'desktop' | 'mobile' | 'tablet';

    if (!pagePath) {
        return res.status(400).json({ error: 'Page path required' });
    }

    const endDate = req.query.end ? new Date(req.query.end as string) : new Date();
    const startDate = req.query.start
        ? new Date(req.query.start as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const domainEvents = events.filter(e => e.trackingId === domain.trackingId);
    const heatmapData = aggregateScrollHeatmap(domainEvents, pagePath, viewport, startDate, endDate);

    res.json({
        ...heatmapData,
        period: { start: startDate, end: endDate }
    });
});

export default router;
