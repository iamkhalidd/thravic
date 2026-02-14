import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { query, queryOne } from '../db';
import { z } from 'zod';

const router = express.Router();

const inviteSchema = z.object({
    email: z.string().email(),
    role: z.enum(['admin', 'viewer']).default('viewer'),
});

// Middleware to check if user is admin of domain
const checkDomainAdmin = async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    const { domainId } = req.params;
    const userId = req.userId!;

    // Check if owner
    const owner = await queryOne('SELECT id FROM domains WHERE id = $1 AND user_id = $2', [domainId, userId]);
    if (owner) return next();

    // Check if admin member
    const member = await queryOne(
        'SELECT role FROM domain_members WHERE domain_id = $1 AND user_id = $2 AND role = \'admin\'',
        [domainId, userId]
    );

    if (member) return next();

    return res.status(403).json({ error: 'Requires admin permissions' });
};

// GET /api/teams/:domainId/members
router.get('/:domainId/members', authenticate, async (req: AuthRequest, res) => {
    const { domainId } = req.params;

    // Check access (viewer or admin)
    const hasAccess = await queryOne(
        `SELECT 1 FROM domains WHERE id = $1 AND user_id = $2
         UNION
         SELECT 1 FROM domain_members WHERE domain_id = $1 AND user_id = $2`,
        [domainId, req.userId!]
    );

    if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

    const members = await query(
        `SELECT u.id, u.name, u.email, dm.role, dm.created_at
         FROM domain_members dm
         JOIN users u ON dm.user_id = u.id
         WHERE dm.domain_id = $1
         ORDER BY dm.created_at DESC`,
        [domainId]
    );

    res.json(members);
});

// POST /api/teams/:domainId/invite
router.post('/:domainId/invite', authenticate, checkDomainAdmin, async (req: AuthRequest, res) => {
    try {
        const { domainId } = req.params;
        const { email, role } = inviteSchema.parse(req.body);

        // Find user by email
        const user = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
        if (!user) {
            // In a real app, we would create a pending invite or send an email to register.
            // For MVP, we require the user to exist.
            return res.status(404).json({ error: 'User not found. They must register first.' });
        }

        // Add member
        await query(
            `INSERT INTO domain_members (domain_id, user_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (domain_id, user_id) DO UPDATE SET role = $3`,
            [domainId, user.id, role]
        );

        res.json({ message: 'Member added successfully' });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to invite member' });
    }
});

// DELETE /api/teams/:domainId/members/:userId
router.delete('/:domainId/members/:memberId', authenticate, checkDomainAdmin, async (req: AuthRequest, res) => {
    const { domainId, memberId } = req.params;

    await query(
        'DELETE FROM domain_members WHERE domain_id = $1 AND user_id = $2',
        [domainId, memberId]
    );

    res.json({ message: 'Member removed' });
});

export default router;
