import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { query, queryOne } from '../db';
import { z } from 'zod';

const router = express.Router();

const experimentSchema = z.object({
    name: z.string().min(1),
    status: z.enum(['draft', 'active', 'ended']).default('draft'),
    variants: z.array(z.object({
        id: z.string(),
        name: z.string(),
        weight: z.number().min(0).max(100)
    })).min(2, 'At least 2 variants required'),
    trafficAllocation: z.number().min(0).max(100).default(100)
});

// Middleware to check domain access
const checkDomainAccess = async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    const { domainId } = req.params;
    const userId = req.userId!;

    const access = await queryOne(
        `SELECT 1 FROM domains WHERE id = $1 AND user_id = $2
         UNION
         SELECT 1 FROM domain_members WHERE domain_id = $1 AND user_id = $2 AND role = 'admin'`,
        [domainId, userId]
    );

    if (!access) return res.status(403).json({ error: 'Access denied' });
    next();
};

// GET /api/experiments/:domainId
router.get('/:domainId', authenticate, checkDomainAccess, async (req, res) => {
    const { domainId } = req.params;
    const experiments = await query(
        'SELECT * FROM experiments WHERE domain_id = $1 ORDER BY created_at DESC',
        [domainId]
    );
    res.json(experiments);
});

// POST /api/experiments/:domainId
router.post('/:domainId', authenticate, checkDomainAccess, async (req, res) => {
    try {
        const { domainId } = req.params;
        const { name, status, variants, trafficAllocation } = experimentSchema.parse(req.body);

        const result = await query(
            `INSERT INTO experiments (domain_id, name, status, variants, traffic_allocation)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [domainId, name, status, JSON.stringify(variants), trafficAllocation]
        );

        res.status(201).json(result[0]);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to create experiment' });
    }
});

// PUT /api/experiments/:domainId/:experimentId
router.put('/:domainId/:experimentId', authenticate, checkDomainAccess, async (req, res) => {
    try {
        const { domainId, experimentId } = req.params;
        const { name, status, variants, trafficAllocation } = experimentSchema.parse(req.body);

        const result = await query(
            `UPDATE experiments
             SET name = $1, status = $2, variants = $3, traffic_allocation = $4, updated_at = NOW()
             WHERE id = $5 AND domain_id = $6
             RETURNING *`,
            [name, status, JSON.stringify(variants), trafficAllocation, experimentId, domainId]
        );

        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update experiment' });
    }
});

export default router;
