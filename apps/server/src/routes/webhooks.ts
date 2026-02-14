import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { query, queryOne } from '../db';
import { z } from 'zod';

const router = express.Router();

const webhookSchema = z.object({
    url: z.string().url(),
    events: z.array(z.string()).min(1),
    secret: z.string().optional(),
    enabled: z.boolean().default(true),
});

// Middleware to check if user owns domain
const checkDomainAccess = async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    const { domainId } = req.params;
    const userId = req.userId!;

    // Check if owner or admin
    // For MVP, just owner check or reuse team logic
    const access = await queryOne(
        `SELECT 1 FROM domains WHERE id = $1 AND user_id = $2
         UNION
         SELECT 1 FROM domain_members WHERE domain_id = $1 AND user_id = $2 AND role = 'admin'`,
        [domainId, userId]
    );

    if (!access) return res.status(403).json({ error: 'Access denied' });
    next();
};

// GET /api/webhooks/:domainId
router.get('/:domainId', authenticate, checkDomainAccess, async (req, res) => {
    const { domainId } = req.params;
    const webhooks = await query(
        'SELECT * FROM webhooks WHERE domain_id = $1 ORDER BY created_at DESC',
        [domainId]
    );
    res.json(webhooks);
});

// POST /api/webhooks/:domainId
router.post('/:domainId', authenticate, checkDomainAccess, async (req, res) => {
    try {
        const { domainId } = req.params;
        const { url, events, secret, enabled } = webhookSchema.parse(req.body);

        const result = await query(
            `INSERT INTO webhooks (domain_id, url, events, secret, enabled)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [domainId, url, events, secret || null, enabled]
        );

        res.status(201).json(result[0]);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to create webhook' });
    }
});

// DELETE /api/webhooks/:domainId/:webhookId
router.delete('/:domainId/:webhookId', authenticate, checkDomainAccess, async (req, res) => {
    const { domainId, webhookId } = req.params;
    await query(
        'DELETE FROM webhooks WHERE id = $1 AND domain_id = $2',
        [webhookId, domainId]
    );
    res.json({ message: 'Webhook deleted' });
});

export default router;
