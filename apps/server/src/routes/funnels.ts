import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { domains } from './domains';
import { events } from './collect';

const router = Router();

// In-memory funnel storage
interface FunnelStep {
    id: string;
    name: string;
    type: 'pageview' | 'click' | 'custom';
    condition: {
        field: string;
        operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
        value: string;
    };
    order: number;
}

interface Funnel {
    id: string;
    domainId: string;
    name: string;
    description: string;
    steps: FunnelStep[];
    createdAt: Date;
    updatedAt: Date;
}

const funnels: Map<string, Funnel> = new Map();

// Validation schemas
const stepSchema = z.object({
    name: z.string().min(1),
    type: z.enum(['pageview', 'click', 'custom']),
    condition: z.object({
        field: z.string(),
        operator: z.enum(['equals', 'contains', 'startsWith', 'endsWith', 'regex']),
        value: z.string()
    })
});

const createFunnelSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    steps: z.array(stepSchema).min(2).max(10)
});

const updateFunnelSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    steps: z.array(stepSchema).min(2).max(10).optional()
});

// Check if an event matches a step condition
function eventMatchesStep(event: any, step: FunnelStep): boolean {
    if (event.type !== step.type && step.type !== 'custom') return false;

    let fieldValue: string;

    switch (step.condition.field) {
        case 'url':
            fieldValue = event.url || '';
            break;
        case 'path':
            try {
                fieldValue = new URL(event.url).pathname;
            } catch {
                fieldValue = event.url || '';
            }
            break;
        case 'referrer':
            fieldValue = event.referrer || '';
            break;
        case 'eventName':
            fieldValue = event.data?.event || '';
            break;
        default:
            fieldValue = event.data?.[step.condition.field] || '';
    }

    const { operator, value } = step.condition;

    switch (operator) {
        case 'equals':
            return fieldValue === value;
        case 'contains':
            return fieldValue.includes(value);
        case 'startsWith':
            return fieldValue.startsWith(value);
        case 'endsWith':
            return fieldValue.endsWith(value);
        case 'regex':
            try {
                return new RegExp(value).test(fieldValue);
            } catch {
                return false;
            }
        default:
            return false;
    }
}

// Calculate funnel metrics
function calculateFunnelMetrics(funnel: Funnel, domainEvents: any[], startDate: Date, endDate: Date) {
    // Filter events by date
    const filteredEvents = domainEvents.filter(e =>
        e.timestamp >= startDate && e.timestamp <= endDate
    );

    // Group events by visitor
    const visitorEvents: Map<string, any[]> = new Map();
    for (const event of filteredEvents) {
        const existing = visitorEvents.get(event.visitorId) || [];
        existing.push(event);
        visitorEvents.set(event.visitorId, existing);
    }

    // Track step completions
    const stepMetrics = funnel.steps.map((step, index) => ({
        stepId: step.id,
        name: step.name,
        order: index + 1,
        visitors: 0,
        conversions: 0,
        dropoffs: 0,
        dropoffRate: 0,
        conversionRate: 0
    }));

    // For each visitor, track their funnel progress
    const visitorsAtStep: number[] = new Array(funnel.steps.length).fill(0);

    for (const [visitorId, visitorEventList] of visitorEvents) {
        // Sort events by timestamp
        const sortedEvents = visitorEventList.sort(
            (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
        );

        let currentStepIndex = 0;

        for (const event of sortedEvents) {
            if (currentStepIndex >= funnel.steps.length) break;

            const currentStep = funnel.steps[currentStepIndex];

            if (eventMatchesStep(event, currentStep)) {
                visitorsAtStep[currentStepIndex]++;
                currentStepIndex++;
            }
        }
    }

    // Calculate metrics
    const totalVisitors = visitorEvents.size;

    for (let i = 0; i < stepMetrics.length; i++) {
        stepMetrics[i].visitors = visitorsAtStep[i];

        if (i === 0) {
            stepMetrics[i].conversionRate = totalVisitors > 0
                ? (visitorsAtStep[i] / totalVisitors) * 100
                : 0;
        } else {
            const prevVisitors = visitorsAtStep[i - 1];
            stepMetrics[i].conversionRate = prevVisitors > 0
                ? (visitorsAtStep[i] / prevVisitors) * 100
                : 0;
            stepMetrics[i].dropoffs = prevVisitors - visitorsAtStep[i];
            stepMetrics[i].dropoffRate = prevVisitors > 0
                ? (stepMetrics[i].dropoffs / prevVisitors) * 100
                : 0;
        }

        stepMetrics[i].conversions = visitorsAtStep[i];
    }

    const overallConversion = totalVisitors > 0 && visitorsAtStep.length > 0
        ? (visitorsAtStep[visitorsAtStep.length - 1] / totalVisitors) * 100
        : 0;

    return {
        totalVisitors,
        completedFunnel: visitorsAtStep[visitorsAtStep.length - 1] || 0,
        overallConversionRate: Math.round(overallConversion * 100) / 100,
        steps: stepMetrics
    };
}

// GET /api/funnels/:domainId - List funnels for a domain
router.get('/:domainId', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const domainFunnels = Array.from(funnels.values())
        .filter(f => f.domainId === req.params.domainId)
        .map(f => ({
            id: f.id,
            name: f.name,
            description: f.description,
            stepsCount: f.steps.length,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt
        }));

    res.json({ funnels: domainFunnels });
});

// POST /api/funnels/:domainId - Create a new funnel
router.post('/:domainId', authenticate, (req: AuthRequest, res: Response) => {
    try {
        const domain = domains.get(req.params.domainId);

        if (!domain || domain.userId !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const { name, description, steps } = createFunnelSchema.parse(req.body);

        const funnel: Funnel = {
            id: uuidv4(),
            domainId: req.params.domainId,
            name,
            description: description || '',
            steps: steps.map((step, index) => ({
                id: uuidv4(),
                name: step.name,
                type: step.type,
                condition: step.condition,
                order: index + 1
            })),
            createdAt: new Date(),
            updatedAt: new Date()
        };

        funnels.set(funnel.id, funnel);

        res.status(201).json({
            id: funnel.id,
            name: funnel.name,
            description: funnel.description,
            steps: funnel.steps,
            createdAt: funnel.createdAt
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Create funnel error:', error);
        res.status(500).json({ error: 'Failed to create funnel' });
    }
});

// GET /api/funnels/:domainId/:funnelId - Get funnel details with metrics
router.get('/:domainId/:funnelId', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const funnel = funnels.get(req.params.funnelId);

    if (!funnel || funnel.domainId !== req.params.domainId) {
        return res.status(404).json({ error: 'Funnel not found' });
    }

    // Get date range
    const endDate = req.query.end ? new Date(req.query.end as string) : new Date();
    const startDate = req.query.start
        ? new Date(req.query.start as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get domain events
    const domainEvents = events.filter(e => e.trackingId === domain.trackingId);

    // Calculate metrics
    const metrics = calculateFunnelMetrics(funnel, domainEvents, startDate, endDate);

    res.json({
        id: funnel.id,
        name: funnel.name,
        description: funnel.description,
        steps: funnel.steps,
        metrics,
        period: { start: startDate, end: endDate },
        createdAt: funnel.createdAt,
        updatedAt: funnel.updatedAt
    });
});

// PUT /api/funnels/:domainId/:funnelId - Update funnel
router.put('/:domainId/:funnelId', authenticate, (req: AuthRequest, res: Response) => {
    try {
        const domain = domains.get(req.params.domainId);

        if (!domain || domain.userId !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const funnel = funnels.get(req.params.funnelId);

        if (!funnel || funnel.domainId !== req.params.domainId) {
            return res.status(404).json({ error: 'Funnel not found' });
        }

        const updates = updateFunnelSchema.parse(req.body);

        if (updates.name) funnel.name = updates.name;
        if (updates.description !== undefined) funnel.description = updates.description;
        if (updates.steps) {
            funnel.steps = updates.steps.map((step, index) => ({
                id: uuidv4(),
                name: step.name,
                type: step.type,
                condition: step.condition,
                order: index + 1
            }));
        }
        funnel.updatedAt = new Date();

        funnels.set(funnel.id, funnel);

        res.json({
            id: funnel.id,
            name: funnel.name,
            description: funnel.description,
            steps: funnel.steps,
            updatedAt: funnel.updatedAt
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        res.status(500).json({ error: 'Failed to update funnel' });
    }
});

// DELETE /api/funnels/:domainId/:funnelId - Delete funnel
router.delete('/:domainId/:funnelId', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const funnel = funnels.get(req.params.funnelId);

    if (!funnel || funnel.domainId !== req.params.domainId) {
        return res.status(404).json({ error: 'Funnel not found' });
    }

    funnels.delete(req.params.funnelId);

    res.json({ message: 'Funnel deleted successfully' });
});

// GET /api/funnels/:domainId/:funnelId/compare - Compare funnel by source
router.get('/:domainId/:funnelId/compare', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const funnel = funnels.get(req.params.funnelId);

    if (!funnel || funnel.domainId !== req.params.domainId) {
        return res.status(404).json({ error: 'Funnel not found' });
    }

    const endDate = req.query.end ? new Date(req.query.end as string) : new Date();
    const startDate = req.query.start
        ? new Date(req.query.start as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get domain events and group by source
    const domainEvents = events.filter(e =>
        e.trackingId === domain.trackingId &&
        e.timestamp >= startDate &&
        e.timestamp <= endDate
    );

    // Group events by UTM source
    const sourceGroups: Map<string, any[]> = new Map();

    for (const event of domainEvents) {
        const source = event.utmSource || 'direct';
        const existing = sourceGroups.get(source) || [];
        existing.push(event);
        sourceGroups.set(source, existing);
    }

    // Calculate metrics per source
    const comparison = [];

    for (const [source, sourceEvents] of sourceGroups) {
        const metrics = calculateFunnelMetrics(
            funnel,
            sourceEvents,
            new Date(0), // Already filtered above
            new Date()
        );

        comparison.push({
            source,
            ...metrics
        });
    }

    // Sort by conversion rate
    comparison.sort((a, b) => b.overallConversionRate - a.overallConversionRate);

    res.json({
        funnel: { id: funnel.id, name: funnel.name },
        period: { start: startDate, end: endDate },
        comparison
    });
});

export { funnels };
export default router;
