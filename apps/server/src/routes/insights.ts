import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireFeature } from '../middleware/featureGate';
import * as domainService from '../services/domainService';
import * as eventService from '../services/eventService';
import * as sessionService from '../services/sessionService';
import { createLogger } from '../config/logger';

const log = createLogger('Insights');
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI } from '@google/genai';

const router = Router();

// Helper: Calculate percent change
function percentChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
}

// GET /api/insights/:domainId/trends - Get historical data and forecast trends
router.get('/:domainId/trends', authenticate, requireFeature('insights'), async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const now = new Date();
        const start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // last 14 days
        const timeseries = await eventService.getTimeseries(domain.id, start, now, 'day');

        const historical: any[] = [];
        let runningViews = 0;
        let runningVisitors = 0;

        for (let i = 13; i >= 0; i--) {
            const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dateString = date.toISOString().split('T')[0];
            const dataPoint = timeseries.find(t => t.bucket.startsWith(dateString));
            
            const pv = dataPoint?.pageviews || 0;
            const vis = dataPoint?.visitors || 0;
            
            // Simple moving average
            runningViews = (runningViews * 0.7) + (pv * 0.3);
            runningVisitors = (runningVisitors * 0.7) + (vis * 0.3);

            historical.push({
                date: dateString,
                pageviews: pv,
                visitors: vis,
                pageviewsMA: Math.round(runningViews),
                visitorsMA: Math.round(runningVisitors)
            });
        }

        const forecast: any[] = [];
        let lastPv = historical[historical.length - 1].pageviewsMA;
        const trendFactor = (historical[historical.length - 1].pageviewsMA - historical[0].pageviewsMA) / 14;

        for (let i = 1; i <= 7; i++) {
            const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
            const dateString = date.toISOString().split('T')[0];
            const predicted = Math.max(0, Math.round(lastPv + (trendFactor * i)));
            
            forecast.push({
                date: dateString,
                predicted,
                confidence: Math.max(0, 100 - (i * 10))
            });
        }

        const trendDirection = trendFactor > 1 ? 'up' : trendFactor < -1 ? 'down' : 'stable';

        res.json({
            historical,
            forecast,
            trend: {
                direction: trendDirection,
                strength: Math.abs(trendFactor)
            }
        });
    } catch (error) {
        log.error('Trends error', error);
        res.status(500).json({ error: 'Failed to generate trends' });
    }
});

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

        let insights: any[] = [];

        // Try AI generation if API key exists
        if (process.env.GEMINI_API_KEY) {
            try {
                const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
                const prompt = `You are an expert web analytics AI. I will provide you with analytics data for the past 7 days compared to the previous 7 days.
Please analyze this data and return exactly 3 insightful recommendations in JSON array format.
Each insight MUST match this interface exactly:
{
    "type": "trend" | "anomaly" | "performance" | "opportunity" | "warning",
    "priority": "high" | "medium" | "low",
    "title": "Short catchy title",
    "description": "Clear explanation of what happened",
    "metric": "Which metric this relates to e.g. 'pageviews', 'bounceRate', 'avgSessionDuration'",
    "recommendation": "Actionable advice on what to do"
}

Data for last 7 days vs previous 7 days:
- Pageviews: ${currentPageviews} (was ${previousPageviews})
- Unique Visitors: ${currentVisitors} (was ${previousVisitors})
- Sessions: ${currentSessions} (was ${previousSessions})
- Bounce Rate: ${currentBounceRate}% (was ${previousBounceRate}%)
- Avg Session Duration: ${currentAvgDuration}s (was ${previousAvgDuration}s)

Return ONLY a valid JSON array, do not include markdown blocks.`;

                const response = await ai.models.generateContent({
                    model: 'gemini-1.5-flash',
                    contents: prompt,
                    config: {
                        responseMimeType: 'application/json',
                        temperature: 0.7
                    }
                });

                const text = response.text || "[]";
                const parsedInsights = JSON.parse(text);
                
                insights = parsedInsights.map((insight: any) => ({
                    id: uuidv4(),
                    ...insight,
                    createdAt: new Date()
                }));

                return res.json({
                    insights,
                    period: {
                        current: { start: currentStart, end: currentEnd },
                        previous: { start: previousStart, end: previousEnd }
                    },
                    generatedAt: new Date(),
                    aiGenerated: true
                });
            } catch (err) {
                log.error('Gemini error, falling back to basic insights', err);
            }
        }

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
            generatedAt: new Date(),
            aiGenerated: false
        });
    } catch (error) {
        log.error('Insights error', error);
        res.status(500).json({ error: 'Failed to generate insights' });
    }
});

export default router;
