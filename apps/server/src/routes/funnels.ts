import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import * as domainService from '../services/domainService';
import * as funnelService from '../services/funnelService';
import * as eventService from '../services/eventService';
import { createFunnelSchema, updateFunnelSchema } from '../validators/funnels';

const router = Router();



// GET /api/funnels/:domainId - List funnels
router.get('/:domainId', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const funnels = await funnelService.listByDomain(domain.id);

        res.json({
            funnels: funnels.map(f => ({
                id: f.id,
                name: f.name,
                description: f.description,
                stepsCount: f.steps.length,
                createdAt: f.created_at,
                updatedAt: f.updated_at
            }))
        });
    } catch (error) {
        console.error('List funnels error:', error);
        res.status(500).json({ error: 'Failed to list funnels' });
    }
});

// POST /api/funnels/:domainId - Create funnel
router.post('/:domainId', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const { name, description, steps } = createFunnelSchema.parse(req.body);

        const funnel = await funnelService.create(domain.id, name, description, steps);

        res.status(201).json({
            id: funnel.id,
            name: funnel.name,
            description: funnel.description,
            steps: funnel.steps.map(s => ({
                id: s.id,
                name: s.name,
                type: s.type,
                matchType: s.match_type,
                matchValue: s.match_value,
                order: s.step_order
            })),
            createdAt: funnel.created_at
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Create funnel error:', error);
        res.status(500).json({ error: 'Failed to create funnel' });
    }
});

// GET /api/funnels/:domainId/:funnelId - Get funnel with metrics
router.get('/:domainId/:funnelId', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const funnel = await funnelService.getById(req.params.funnelId);
        if (!funnel || funnel.domain_id !== domain.id) {
            return res.status(404).json({ error: 'Funnel not found' });
        }

        // Calculate funnel metrics from events
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        const events = await eventService.queryByDomain(domain.id, startDate, endDate);

        // Simple step-through conversion calculation
        const stepResults = funnel.steps.map(step => {
            const matches = events.filter(e => {
                if (step.type !== e.type) return false;
                const value = e.url || '';
                switch (step.match_type) {
                    case 'exact': return value === step.match_value;
                    case 'contains': return value.includes(step.match_value);
                    case 'regex':
                        try { return new RegExp(step.match_value).test(value); }
                        catch { return false; }
                    default: return false;
                }
            });
            return {
                id: step.id,
                name: step.name,
                type: step.type,
                matchType: step.match_type,
                matchValue: step.match_value,
                order: step.step_order,
                visitors: new Set(matches.map(m => m.visitor_id)).size,
                events: matches.length
            };
        });

        // Calculate conversion rates between steps
        const stepsWithConversion = stepResults.map((step, i) => ({
            ...step,
            conversionRate: i === 0
                ? 100
                : stepResults[i - 1].visitors > 0
                    ? Math.round((step.visitors / stepResults[i - 1].visitors) * 10000) / 100
                    : 0,
            dropoff: i === 0
                ? 0
                : stepResults[i - 1].visitors - step.visitors
        }));

        res.json({
            id: funnel.id,
            name: funnel.name,
            description: funnel.description,
            steps: stepsWithConversion,
            overallConversion: stepResults.length > 0 && stepResults[0].visitors > 0
                ? Math.round((stepResults[stepResults.length - 1].visitors / stepResults[0].visitors) * 10000) / 100
                : 0,
            period: { start: startDate, end: endDate }
        });
    } catch (error) {
        console.error('Get funnel error:', error);
        res.status(500).json({ error: 'Failed to get funnel' });
    }
});

// PUT /api/funnels/:domainId/:funnelId - Update funnel
router.put('/:domainId/:funnelId', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const existing = await funnelService.getById(req.params.funnelId);
        if (!existing || existing.domain_id !== domain.id) {
            return res.status(404).json({ error: 'Funnel not found' });
        }

        const data = updateFunnelSchema.parse(req.body);

        const updated = await funnelService.update(
            req.params.funnelId,
            data.name || existing.name,
            data.description || existing.description || '',
            data.steps || existing.steps.map(s => ({
                name: s.name,
                type: s.type,
                matchType: s.match_type,
                matchValue: s.match_value
            }))
        );

        if (!updated) {
            return res.status(404).json({ error: 'Funnel not found' });
        }

        res.json({
            id: updated.id,
            name: updated.name,
            description: updated.description,
            updatedAt: updated.updated_at
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Update funnel error:', error);
        res.status(500).json({ error: 'Failed to update funnel' });
    }
});

// DELETE /api/funnels/:domainId/:funnelId - Delete funnel
router.delete('/:domainId/:funnelId', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const funnel = await funnelService.getById(req.params.funnelId);
        if (!funnel || funnel.domain_id !== domain.id) {
            return res.status(404).json({ error: 'Funnel not found' });
        }

        await funnelService.remove(req.params.funnelId);
        res.json({ message: 'Funnel deleted successfully' });
    } catch (error) {
        console.error('Delete funnel error:', error);
        res.status(500).json({ error: 'Failed to delete funnel' });
    }
});

export default router;
