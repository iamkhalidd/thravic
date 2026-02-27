import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { registerSchema, loginSchema, refreshSchema, forgotPasswordSchema, resetPasswordSchema } from '../validators/auth';
import * as userService from '../services/userService';
import { getJwtSecret, getJwtRefreshSecret } from '../config/security';
import * as tokenStore from '../services/tokenStore';
import * as cache from '../services/cacheService';
import { sendEmail } from '../services/emailService';
import { createLogger } from '../config/logger';

const log = createLogger('Auth');

const router = Router();

// ── Rate-limit constants for password reset ──
const RESET_RATE_LIMIT_MAX = 3;          // max requests per email
const RESET_RATE_LIMIT_WINDOW = 60 * 60; // 1 hour in seconds
const RESET_TOKEN_TTL = 60 * 60;         // token valid for 1 hour

// In-memory fallback for rate-limiting when Redis is unavailable
const memoryRateLimit = new Map<string, { count: number; expiresAt: number }>();
const memoryResetTokens = new Map<string, { userId: string; expiresAt: number }>();

// Generate tokens
async function generateTokens(userId: string, email: string) {
    const accessToken = jwt.sign(
        { userId, email },
        getJwtSecret(),
        { expiresIn: process.env.JWT_EXPIRES_IN || '15m' } as jwt.SignOptions
    );

    const refreshToken = jwt.sign(
        { userId, email },
        getJwtRefreshSecret(),
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' } as jwt.SignOptions
    );

    await tokenStore.storeRefreshToken(refreshToken);

    return { accessToken, refreshToken };
}

/**
 * Check if an email has exceeded the password-reset rate limit.
 * Returns true if the request should be blocked.
 */
async function isResetRateLimited(email: string): Promise<boolean> {
    const key = `pwd-reset-rl:${email.toLowerCase()}`;

    // Try Redis first
    const current = await cache.get<number>(key);
    if (current !== null) {
        if (current >= RESET_RATE_LIMIT_MAX) return true;
        await cache.set(key, current + 1, RESET_RATE_LIMIT_WINDOW);
        return false;
    }

    // Fallback: in-memory (used when Redis is unavailable)
    const now = Date.now();
    const entry = memoryRateLimit.get(key);

    if (entry && entry.expiresAt > now) {
        if (entry.count >= RESET_RATE_LIMIT_MAX) return true;
        entry.count++;
        return false;
    }

    // First request — start a new window (Redis or memory)
    await cache.set(key, 1, RESET_RATE_LIMIT_WINDOW);
    memoryRateLimit.set(key, { count: 1, expiresAt: now + RESET_RATE_LIMIT_WINDOW * 1000 });
    return false;
}

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { email, password, name } = registerSchema.parse(req.body);

        const existingUser = await userService.findByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await userService.createUser(email, hashedPassword, name);
        const tokens = await generateTokens(user.id, user.email);

        res.status(201).json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                subscription: user.subscription
            },
            ...tokens
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        log.error('Register error', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = loginSchema.parse(req.body);

        const user = await userService.findByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const tokens = await generateTokens(user.id, user.email);

        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                subscription: user.subscription
            },
            ...tokens
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        log.error('Login error', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken || !(await tokenStore.hasRefreshToken(refreshToken))) {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        const decoded = jwt.verify(
            refreshToken,
            getJwtRefreshSecret()
        ) as { userId: string; email: string };

        // Rotate: remove old, issue new
        await tokenStore.removeRefreshToken(refreshToken);
        const tokens = await generateTokens(decoded.userId, decoded.email);

        res.json(tokens);
    } catch (error) {
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});

// POST /api/auth/logout
router.post('/logout', async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (refreshToken) {
        await tokenStore.removeRefreshToken(refreshToken);
    }

    res.json({ message: 'Logged out successfully' });
});

// ── Password Reset ──────────────────────────

// POST /api/auth/forgot-password
// Rate limited: max 3 requests per email per hour
router.post('/forgot-password', async (req: Request, res: Response) => {
    try {
        const { email } = forgotPasswordSchema.parse(req.body);
        const normalizedEmail = email.toLowerCase();

        // Always return success to prevent email enumeration
        const genericResponse = { message: 'If that email is registered, a reset link has been sent.' };

        // Check rate limit
        if (await isResetRateLimited(normalizedEmail)) {
            log.warn(`Password reset rate limit exceeded for ${normalizedEmail}`);
            return res.status(429).json({ error: 'Too many password reset requests. Please try again later.' });
        }

        const user = await userService.findByEmail(normalizedEmail);
        if (!user) {
            // Don't reveal that the email doesn't exist
            return res.json(genericResponse);
        }

        // Generate a secure reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenKey = `pwd-reset-token:${resetToken}`;

        // Store token → userId mapping in Redis (or memory fallback)
        await cache.set(tokenKey, user.id, RESET_TOKEN_TTL);
        memoryResetTokens.set(resetToken, {
            userId: user.id,
            expiresAt: Date.now() + RESET_TOKEN_TTL * 1000,
        });

        // Build reset link
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

        // Send email
        await sendEmail({
            to: user.email,
            subject: 'TrackFlow — Password Reset',
            text: `You requested a password reset. Click the link below to set a new password:\n\n${resetLink}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.`,
            html: `
                <p>You requested a password reset.</p>
                <p><a href="${resetLink}">Click here to reset your password</a></p>
                <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
            `,
        });

        log.info(`Password reset email sent to ${normalizedEmail}`);
        res.json(genericResponse);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        log.error('Forgot password error', error);
        res.status(500).json({ error: 'Failed to process password reset request' });
    }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req: Request, res: Response) => {
    try {
        const { token, password } = resetPasswordSchema.parse(req.body);
        const tokenKey = `pwd-reset-token:${token}`;

        // Look up the token in Redis first, then memory fallback
        let userId = await cache.get<string>(tokenKey);

        if (!userId) {
            const memEntry = memoryResetTokens.get(token);
            if (memEntry && memEntry.expiresAt > Date.now()) {
                userId = memEntry.userId;
            }
        }

        if (!userId) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        // Hash the new password and update
        const hashedPassword = await bcrypt.hash(password, 12);
        await userService.updatePassword(userId, hashedPassword);

        // Invalidate the token so it can't be reused
        await cache.del(tokenKey);
        memoryResetTokens.delete(token);

        log.info(`Password reset completed for user ${userId}`);
        res.json({ message: 'Password has been reset successfully' });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        log.error('Reset password error', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
    const user = await userService.findById(req.userId!);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        subscription: user.subscription,
        preferences: user.preferences || {},
        createdAt: user.created_at
    });
});

// PATCH /api/auth/me
router.patch('/me', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { preferences } = req.body;

        if (!preferences || typeof preferences !== 'object') {
            return res.status(400).json({ error: 'Preferences must be an object' });
        }

        const user = await userService.updatePreferences(req.userId!, preferences);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: user.id,
            preferences: user.preferences
        });
    } catch (error) {
        log.error('Update preferences error', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});


export default router;
