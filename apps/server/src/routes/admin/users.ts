// Admin Users Route — Full user management CRUD
import { Router, Response } from 'express';
import { adminAuth, superAdminAuth } from '../../middleware/adminAuth';
import { AuthRequest } from '../../middleware/auth';
import { query, queryOne } from '../../db';
import { logAction } from '../../services/auditService';
import { createLogger } from '../../config/logger';
import { updateUserSchema, adminResetPasswordSchema } from '../../validators/admin';
import { sendAccountSuspendedEmail, sendAccountReactivatedEmail, sendEmail } from '../../services/emailService';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../../config/security';

const log = createLogger('Admin:Users');
const router = Router();

// GET /api/admin/users — list all users with search/filter/pagination
router.get('/', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const search = req.query.search || '';
        const plan = req.query.plan || '';
        const role = req.query.role || '';
        const sort = (req.query.sort as string) || 'created_at';
        const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
        const limit = Math.min(parseInt((req.query.limit as string) || '25'), 100);
        const offset = parseInt((req.query.offset as string) || '0');

        const conditions: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (search) {
            conditions.push(`(u.name ILIKE $${idx} OR u.email ILIKE $${idx})`);
            params.push(`%${search}%`);
            idx++;
        }
        if (plan) {
            conditions.push(`u.subscription = $${idx++}`);
            params.push(plan);
        }
        if (role) {
            conditions.push(`u.role = $${idx++}`);
            params.push(role);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const validSorts = ['created_at', 'name', 'email', 'subscription'];
        const sortCol = validSorts.includes(sort) ? sort : 'created_at';

        const users = await query(
            `SELECT u.id, u.name, u.email, u.subscription, u.role, u.created_at,
                    COUNT(DISTINCT d.id) as domains_count,
                    COALESCE(SUM(ul.events_count), 0) as total_events
             FROM users u
             LEFT JOIN domains d ON d.user_id = u.id
             LEFT JOIN usage_logs ul ON ul.domain_id = d.id
             ${where}
             GROUP BY u.id
             ORDER BY u.${sortCol} ${order}
             LIMIT $${idx++} OFFSET $${idx++}`,
            [...params, limit, offset]
        );

        const countResult = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM users u ${where}`,
            params
        );

        res.json({
            users,
            total: parseInt(countResult?.count || '0'),
            limit,
            offset
        });
    } catch (error) {
        log.error('Users list error', error);
        res.status(500).json({ error: 'Failed to load users' });
    }
});

// GET /api/admin/users/:id — user detail
router.get('/:id', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const user = await queryOne(
            `SELECT id, name, email, subscription, role, paystack_customer_code,
                    preferences, created_at, updated_at
             FROM users WHERE id = $1`,
            [req.params.id]
        );

        if (!user) return res.status(404).json({ error: 'User not found' });

        const domains = await query(
            `SELECT d.*, COUNT(e.id) as events_count
             FROM domains d
             LEFT JOIN events e ON e.domain_id = d.id AND e.created_at >= NOW() - INTERVAL '30 days'
             WHERE d.user_id = $1
             GROUP BY d.id
             ORDER BY d.created_at DESC`,
            [req.params.id]
        );

        const subscription = await queryOne(
            `SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [req.params.id]
        );

        res.json({ user, domains, subscription });
    } catch (error) {
        log.error('User detail error', error);
        res.status(500).json({ error: 'Failed to load user' });
    }
});

// PATCH /api/admin/users/:id — update user
router.patch('/:id', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const validated = updateUserSchema.parse(req.body);
        const { name, email, subscription, role } = validated;

        const updates: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (name) { updates.push(`name = $${idx++}`); params.push(name); }
        if (email) { updates.push(`email = $${idx++}`); params.push(email); }
        if (subscription) { updates.push(`subscription = $${idx++}`); params.push(subscription); }
        if (role) { updates.push(`role = $${idx++}`); params.push(role); }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        updates.push(`updated_at = NOW()`);
        params.push(req.params.id);

        const user = await queryOne(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, name, email, subscription, role`,
            params
        );

        // Sync the subscriptions table when plan changes
        if (subscription && user) {
            const PLAN_LIMITS: Record<string, { events: number; domains: number }> = {
                free:   { events: 5_000,     domains: 1  },
                pro:    { events: 100_000,   domains: 3  },
                agency: { events: 500_000,   domains: 20 },
            };
            const limits = PLAN_LIMITS[subscription] ?? PLAN_LIMITS.free;
            await query(
                `INSERT INTO subscriptions (user_id, plan, status, events_limit, domains_limit)
                 VALUES ($1, $2, 'active', $3, $4)
                 ON CONFLICT (user_id) DO UPDATE
                   SET plan = $2, events_limit = $3, domains_limit = $4, updated_at = NOW(), events_used = subscriptions.events_used`,
                [req.params.id, subscription, limits.events, limits.domains]
            );
        }

        await logAction({
            adminId: req.userId!,
            action: 'user.update',
            targetType: 'user',
            targetId: req.params.id,
            details: { updates: validated },
            ipAddress: req.ip
        });

        res.json(user);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        log.error('User update error', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// POST /api/admin/users/:id/suspend — toggle suspension
router.post('/:id/suspend', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const user = await queryOne<{ role: string; email: string; name: string }>(
            'SELECT role, email, name FROM users WHERE id = $1',
            [req.params.id]
        );

        if (!user) return res.status(404).json({ error: 'User not found' });

        const newRole = user.role === 'suspended' ? 'user' : 'suspended';

        await query(
            `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`,
            [newRole, req.params.id]
        );

        await logAction({
            adminId: req.userId!,
            action: newRole === 'suspended' ? 'user.suspend' : 'user.activate',
            targetType: 'user',
            targetId: req.params.id,
            ipAddress: req.ip
        });

        // Notify the user by email (non-blocking)
        if (newRole === 'suspended') {
            sendAccountSuspendedEmail(user.email, user.name).catch(err =>
                log.warn('Suspend email failed', err)
            );
        } else {
            sendAccountReactivatedEmail(user.email, user.name).catch(err =>
                log.warn('Reactivate email failed', err)
            );
        }

        res.json({ message: `User ${newRole === 'suspended' ? 'suspended' : 'activated'}` });
    } catch (error) {
        log.error('User suspend error', error);
        res.status(500).json({ error: 'Failed to toggle user status' });
    }
});

// POST /api/admin/users/:id/email — direct email from dashboard
router.post('/:id/email', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { subject, message } = req.body;
        if (!subject || !message) {
            return res.status(400).json({ error: 'Subject and message are required' });
        }

        const user = await queryOne<{ email: string; name: string }>(
            'SELECT email, name FROM users WHERE id = $1',
            [req.params.id]
        );

        if (!user) return res.status(404).json({ error: 'User not found' });

        await sendEmail({
            to: user.email,
            subject: subject,
            text: message,
            html: message.replace(/\n/g, '<br>')
        });

        await logAction({
            adminId: req.userId!,
            action: 'user.email_sent',
            targetType: 'user',
            targetId: req.params.id,
            details: { subject },
            ipAddress: req.ip
        });

        res.json({ message: 'Email sent successfully' });
    } catch (error) {
        log.error('Direct email error', error);
        res.status(500).json({ error: 'Failed to send direct email' });
    }
});

// POST /api/admin/users/:id/reset-password — reset password
router.post('/:id/reset-password', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { newPassword } = adminResetPasswordSchema.parse(req.body);

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await query(
            'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
            [hashedPassword, req.params.id]
        );

        await logAction({
            adminId: req.userId!,
            action: 'user.reset_password',
            targetType: 'user',
            targetId: req.params.id,
            ipAddress: req.ip
        });

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        log.error('Password reset error', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// DELETE /api/admin/users/:id — delete user (super_admin only)
router.delete('/:id', superAdminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const user = await queryOne<{ id: string; email: string }>(
            'SELECT id, email FROM users WHERE id = $1',
            [req.params.id]
        );

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Cascade delete happens via FK constraints
        await query('DELETE FROM users WHERE id = $1', [req.params.id]);

        await logAction({
            adminId: req.userId!,
            action: 'user.delete',
            targetType: 'user',
            targetId: req.params.id,
            details: { email: user.email },
            ipAddress: req.ip
        });

        res.json({ message: 'User deleted' });
    } catch (error) {
        log.error('User delete error', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// POST /api/admin/users/:id/impersonate — issue short-lived token to view as a user
// superAdminAuth only — shows in audit log
router.post('/:id/impersonate', superAdminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const target = await queryOne<{ id: string; name: string; email: string; role: string }>(
            'SELECT id, name, email, role FROM users WHERE id = $1',
            [req.params.id]
        );

        if (!target) return res.status(404).json({ error: 'User not found' });

        // Refuse to impersonate another admin
        if (target.role === 'admin' || target.role === 'super_admin') {
            return res.status(403).json({ error: 'Cannot impersonate an admin account' });
        }

        // Issue a short-lived JWT (15 min) with an impersonatedBy claim
        const token = jwt.sign(
            {
                userId: target.id,
                email: target.email,
                impersonatedBy: req.userId,
            },
            getJwtSecret(),
            { expiresIn: '15m' }
        );

        await logAction({
            adminId: req.userId!,
            action: 'user.impersonate',
            targetType: 'user',
            targetId: target.id,
            details: { targetEmail: target.email },
            ipAddress: req.ip,
        });

        res.json({
            token,
            user: { id: target.id, name: target.name, email: target.email },
            expiresIn: 900, // seconds
        });
    } catch (error) {
        log.error('Impersonation error', error);
        res.status(500).json({ error: 'Failed to create impersonation session' });
    }
});

export default router;
