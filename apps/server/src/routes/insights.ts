import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { domains } from './domains';
import { events } from './collect';

const router = Router();

// Helper: Calculate simple moving average
function movingAverage(data: number[], window: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
        const start = Math.max(0, i - window + 1);
        const slice = data.slice(start, i + 1);
        result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
    return result;
}

// Helper: Calculate standard deviation
function standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
}

// Helper: Detect anomalies using z-score
function detectAnomalies(values: number[], threshold: number = 2): number[] {
    if (values.length < 3) return [];

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = standardDeviation(values);

    if (std === 0) return [];

    const anomalyIndices: number[] = [];
    values.forEach((v, i) => {
        const zScore = Math.abs((v - mean) / std);
        if (zScore > threshold) {
            anomalyIndices.push(i);
        }
    });

    return anomalyIndices;
}

// Helper: Calculate trend direction
function calculateTrend(values: number[]): 'up' | 'down' | 'stable' {
    if (values.length < 2) return 'stable';

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const changePercent = ((secondAvg - firstAvg) / (firstAvg || 1)) * 100;

    if (changePercent > 10) return 'up';
    if (changePercent < -10) return 'down';
    return 'stable';
}

// Helper: Calculate percent change
function percentChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
}

interface Insight {
    id: string;
    type: 'trend' | 'anomaly' | 'performance' | 'opportunity' | 'warning';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    metric: string;
    value: number | string;
    change?: number;
    recommendation?: string;
    createdAt: Date;
}

// GET /api/insights/:domainId - Get AI-generated insights
router.get('/:domainId', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    // Get date range (default last 30 days)
    const endDate = new Date();
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const previousStartDate = new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get domain events
    const domainEvents = events.filter(e =>
        e.trackingId === domain.trackingId &&
        e.timestamp >= previousStartDate
    );

    const currentPeriodEvents = domainEvents.filter(e => e.timestamp >= startDate);
    const previousPeriodEvents = domainEvents.filter(e =>
        e.timestamp >= previousStartDate && e.timestamp < startDate
    );

    const insights: Insight[] = [];

    // --- Traffic Trend Analysis ---
    const dailyPageviews: Map<string, number> = new Map();
    currentPeriodEvents.filter(e => e.type === 'pageview').forEach(e => {
        const day = e.timestamp.toISOString().split('T')[0];
        dailyPageviews.set(day, (dailyPageviews.get(day) || 0) + 1);
    });

    const pageviewValues = Array.from(dailyPageviews.values());
    const currentPageviews = pageviewValues.reduce((a, b) => a + b, 0);
    const previousPageviews = previousPeriodEvents.filter(e => e.type === 'pageview').length;
    const pageviewChange = percentChange(currentPageviews, previousPageviews);
    const pageviewTrend = calculateTrend(pageviewValues);

    if (Math.abs(pageviewChange) > 20) {
        insights.push({
            id: 'traffic-trend-1',
            type: 'trend',
            priority: 'high',
            title: pageviewChange > 0 ? 'Traffic is Growing' : 'Traffic Decline Detected',
            description: `Your pageviews have ${pageviewChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(pageviewChange)}% compared to the previous period.`,
            metric: 'pageviews',
            value: currentPageviews,
            change: pageviewChange,
            recommendation: pageviewChange > 0
                ? 'Keep up the momentum! Consider increasing content output.'
                : 'Review your traffic sources and SEO strategy.',
            createdAt: new Date()
        });
    }

    // --- Anomaly Detection ---
    const anomalyIndices = detectAnomalies(pageviewValues);
    if (anomalyIndices.length > 0) {
        const days = Array.from(dailyPageviews.keys());
        const anomalyDays = anomalyIndices.map(i => days[i]).filter(Boolean);

        if (anomalyDays.length > 0) {
            insights.push({
                id: 'anomaly-1',
                type: 'anomaly',
                priority: 'medium',
                title: 'Unusual Traffic Pattern Detected',
                description: `We detected unusual traffic on ${anomalyDays.slice(0, 3).join(', ')}. This could indicate a viral post or bot traffic.`,
                metric: 'pageviews',
                value: `${anomalyDays.length} days`,
                recommendation: 'Review traffic sources for these days to understand the cause.',
                createdAt: new Date()
            });
        }
    }

    // --- Channel Performance Analysis ---
    const sourcePerformance: Map<string, { count: number; visitors: Set<string> }> = new Map();
    currentPeriodEvents.forEach(e => {
        const source = e.utmSource || (e.referrer ? 'referral' : 'direct');
        const perf = sourcePerformance.get(source) || { count: 0, visitors: new Set() };
        perf.count++;
        perf.visitors.add(e.visitorId);
        sourcePerformance.set(source, perf);
    });

    const sortedSources = Array.from(sourcePerformance.entries())
        .map(([source, data]) => ({
            source,
            count: data.count,
            visitors: data.visitors.size
        }))
        .sort((a, b) => b.visitors - a.visitors);

    if (sortedSources.length > 0) {
        const topSource = sortedSources[0];
        insights.push({
            id: 'channel-1',
            type: 'performance',
            priority: 'medium',
            title: `${topSource.source.charAt(0).toUpperCase() + topSource.source.slice(1)} is Your Top Channel`,
            description: `${topSource.source} brings ${topSource.visitors} unique visitors, making it your best performing channel.`,
            metric: 'source',
            value: topSource.source,
            recommendation: `Invest more in ${topSource.source} marketing to maximize ROI.`,
            createdAt: new Date()
        });
    }

    // Check for underperforming channels
    if (sortedSources.length > 1) {
        const worstSource = sortedSources[sortedSources.length - 1];
        if (worstSource.visitors < sortedSources[0].visitors * 0.1) {
            insights.push({
                id: 'channel-2',
                type: 'opportunity',
                priority: 'low',
                title: `${worstSource.source.charAt(0).toUpperCase() + worstSource.source.slice(1)} Needs Attention`,
                description: `${worstSource.source} only brings ${worstSource.visitors} visitors. Consider improving this channel or reallocating resources.`,
                metric: 'source',
                value: worstSource.source,
                recommendation: 'Analyze why this channel underperforms and optimize or pivot.',
                createdAt: new Date()
            });
        }
    }

    // --- Bounce Rate Analysis ---
    const sessionsWithSinglePage: Map<string, boolean> = new Map();
    currentPeriodEvents.filter(e => e.type === 'pageview').forEach(e => {
        const hasMultiple = sessionsWithSinglePage.has(e.sessionId);
        sessionsWithSinglePage.set(e.sessionId, hasMultiple ? true : false);
    });

    const totalSessions = sessionsWithSinglePage.size;
    const bouncedSessions = Array.from(sessionsWithSinglePage.values()).filter(v => !v).length;
    const bounceRate = totalSessions > 0 ? (bouncedSessions / totalSessions) * 100 : 0;

    if (bounceRate > 70) {
        insights.push({
            id: 'bounce-1',
            type: 'warning',
            priority: 'high',
            title: 'High Bounce Rate Detected',
            description: `Your bounce rate is ${bounceRate.toFixed(1)}%. Most visitors leave after viewing just one page.`,
            metric: 'bounceRate',
            value: `${bounceRate.toFixed(1)}%`,
            recommendation: 'Improve page load speed, add internal links, and make CTAs more compelling.',
            createdAt: new Date()
        });
    } else if (bounceRate < 30 && totalSessions > 10) {
        insights.push({
            id: 'bounce-2',
            type: 'performance',
            priority: 'low',
            title: 'Excellent Engagement',
            description: `Your bounce rate of ${bounceRate.toFixed(1)}% is excellent! Visitors are exploring multiple pages.`,
            metric: 'bounceRate',
            value: `${bounceRate.toFixed(1)}%`,
            createdAt: new Date()
        });
    }

    // --- Top Pages Analysis ---
    const pageViews: Map<string, number> = new Map();
    currentPeriodEvents.filter(e => e.type === 'pageview').forEach(e => {
        try {
            const path = new URL(e.url).pathname;
            pageViews.set(path, (pageViews.get(path) || 0) + 1);
        } catch { }
    });

    const topPages = Array.from(pageViews.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (topPages.length > 0) {
        const [topPage, topViews] = topPages[0];
        const topPagePercent = currentPageviews > 0
            ? Math.round((topViews / currentPageviews) * 100)
            : 0;

        if (topPagePercent > 50) {
            insights.push({
                id: 'page-1',
                type: 'opportunity',
                priority: 'medium',
                title: 'Traffic Concentrated on One Page',
                description: `${topPage} accounts for ${topPagePercent}% of all traffic. Consider diversifying entry points.`,
                metric: 'pages',
                value: topPage,
                recommendation: 'Create more landing pages or improve internal linking to distribute traffic.',
                createdAt: new Date()
            });
        }
    }

    // Sort insights by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    res.json({
        insights,
        summary: {
            totalInsights: insights.length,
            highPriority: insights.filter(i => i.priority === 'high').length,
            period: { start: startDate, end: endDate }
        }
    });
});

// GET /api/insights/:domainId/trends - Get traffic trend predictions
router.get('/:domainId/trends', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const endDate = new Date();
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const domainEvents = events.filter(e =>
        e.trackingId === domain.trackingId &&
        e.timestamp >= startDate
    );

    // Daily aggregation
    const dailyStats: Map<string, { pageviews: number; visitors: Set<string> }> = new Map();

    domainEvents.forEach(e => {
        const day = e.timestamp.toISOString().split('T')[0];
        const stats = dailyStats.get(day) || { pageviews: 0, visitors: new Set() };
        stats.pageviews++;
        stats.visitors.add(e.visitorId);
        dailyStats.set(day, stats);
    });

    const sortedDays = Array.from(dailyStats.keys()).sort();
    const pageviewSeries = sortedDays.map(d => dailyStats.get(d)!.pageviews);
    const visitorSeries = sortedDays.map(d => dailyStats.get(d)!.visitors.size);

    // Calculate moving averages
    const pageviewMA = movingAverage(pageviewSeries, 7);
    const visitorMA = movingAverage(visitorSeries, 7);

    // Simple prediction using last 7 days trend
    const recentPageviews = pageviewMA.slice(-7);
    const pageviewTrend = calculateTrend(recentPageviews);

    const avgRecentPageviews = recentPageviews.length > 0
        ? recentPageviews.reduce((a, b) => a + b, 0) / recentPageviews.length
        : 0;

    // Generate 7-day forecast
    const forecast = [];
    let forecastValue = avgRecentPageviews;
    const trendMultiplier = pageviewTrend === 'up' ? 1.02 : pageviewTrend === 'down' ? 0.98 : 1;

    for (let i = 1; i <= 7; i++) {
        forecastValue *= trendMultiplier;
        const forecastDate = new Date(endDate);
        forecastDate.setDate(forecastDate.getDate() + i);

        forecast.push({
            date: forecastDate.toISOString().split('T')[0],
            predicted: Math.round(forecastValue),
            confidence: Math.max(50, 95 - i * 5) // Decreasing confidence over time
        });
    }

    res.json({
        historical: sortedDays.map((day, i) => ({
            date: day,
            pageviews: pageviewSeries[i],
            visitors: visitorSeries[i],
            pageviewsMA: Math.round(pageviewMA[i]),
            visitorsMA: Math.round(visitorMA[i])
        })),
        forecast,
        trend: {
            direction: pageviewTrend,
            strength: standardDeviation(recentPageviews)
        }
    });
});

export default router;
