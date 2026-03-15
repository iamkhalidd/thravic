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
import {
    sendWelcomeEmail,
    sendLoginAlertEmail,
    sendPasswordResetEmail,
    sendPasswordChangedEmail,
} from '../services/emailService';
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

        // Send welcome email (non-blocking — don't fail registration if email fails)
        sendWelcomeEmail(user.email, user.name).catch(err =>
            log.warn('Welcome email failed', err)
        );

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
        if (!user || !user.password) {
            return res.status(401).json({ error: 'Invalid credentials. Please use your social login provider if you registered via one.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const tokens = await generateTokens(user.id, user.email);

        // Send login alert (non-blocking)
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'Unknown';
        const ua = req.headers['user-agent'] || 'Unknown';
        sendLoginAlertEmail(user.email, user.name, ip, ua, new Date()).catch(err =>
            log.warn('Login alert email failed', err)
        );

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
    const authHeader = req.headers.authorization;

    if (refreshToken) {
        await tokenStore.removeRefreshToken(refreshToken);
    }
    
    // Blacklist current access token
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.decode(token) as { exp?: number };
            if (decoded && decoded.exp) {
                const ttl = decoded.exp - Math.floor(Date.now() / 1000);
                if (ttl > 0) {
                    // Import the same redis instance cacheService uses
                    await cache.set(`bl:${token}`, '1', ttl);
                }
            }
        } catch (e) {
            // ignore decode error on logout
        }
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

        // Send password reset email
        await sendPasswordResetEmail(user.email, resetLink);

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

        // Notify the user their password was changed
        const user = await userService.findById(userId);
        if (user) {
            const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'Unknown';
            sendPasswordChangedEmail(user.email, user.name, ip).catch(err =>
                log.warn('Password changed email failed', err)
            );
        }

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

    // Generate DiceBear fallback if no avatar set
    const avatarFallback = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user.name)}&backgroundColor=000000&textColor=f4f5f6`;

    res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        subscription: user.subscription,
        preferences: user.preferences || {},
        auth_provider: user.auth_provider || 'email',
        avatar_url: user.avatar_url || avatarFallback,
        company: user.company || null,
        job_title: user.job_title || null,
        website: user.website || null,
        phone: user.phone || null,
        country: user.country || null,
        timezone: user.timezone || null,
        createdAt: user.created_at
    });
});

// PATCH /api/auth/me — update profile fields and/or preferences
router.patch('/me', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { preferences, name, company, job_title, website, phone, country, timezone } = req.body;

        // Update preferences if provided
        if (preferences && typeof preferences === 'object') {
            await userService.updatePreferences(req.userId!, preferences);
        }

        // Update profile fields if any provided
        const profileFields = { name, company, job_title, website, phone, country, timezone };
        const hasProfileFields = Object.values(profileFields).some(v => v !== undefined);

        if (hasProfileFields) {
            await userService.updateProfile(req.userId!, profileFields);
        }

        // Return updated user
        const user = await userService.findById(req.userId!);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const avatarFallback = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user.name)}&backgroundColor=000000&textColor=f4f5f6`;

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            avatar_url: user.avatar_url || avatarFallback,
            company: user.company,
            job_title: user.job_title,
            website: user.website,
            phone: user.phone,
            country: user.country,
            timezone: user.timezone,
            preferences: user.preferences,
        });
    } catch (error) {
        log.error('Update profile error', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// POST /api/auth/avatar — upload avatar image
router.post('/avatar', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        // Accept base64-encoded image from JSON body
        const { image } = req.body;
        if (!image || typeof image !== 'string') {
            return res.status(400).json({ error: 'Image data required' });
        }

        // Validate base64 data URL
        const match = image.match(/^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/);
        if (!match) {
            return res.status(400).json({ error: 'Invalid image format. Use PNG, JPEG, GIF, or WebP.' });
        }

        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        const buffer = Buffer.from(match[2], 'base64');

        // Max 2MB
        if (buffer.length > 2 * 1024 * 1024) {
            return res.status(400).json({ error: 'Image must be under 2MB' });
        }

        // Save to disk
        const fs = await import('fs/promises');
        const path = await import('path');
        const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');
        await fs.mkdir(uploadDir, { recursive: true });

        const filename = `${req.userId}.${ext}`;
        await fs.writeFile(path.join(uploadDir, filename), buffer);

        // Store relative URL
        const avatarUrl = `/uploads/avatars/${filename}`;
        await userService.updateAvatar(req.userId!, avatarUrl);

        res.json({ avatar_url: avatarUrl });
    } catch (error) {
        log.error('Avatar upload error', error);
        res.status(500).json({ error: 'Failed to upload avatar' });
    }
});

// DELETE /api/auth/avatar — remove custom avatar
router.delete('/avatar', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        await userService.updateAvatar(req.userId!, null);
        const user = await userService.findById(req.userId!);
        const fallback = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user?.name || 'U')}&backgroundColor=000000&textColor=f4f5f6`;
        res.json({ avatar_url: fallback });
    } catch (error) {
        log.error('Avatar delete error', error);
        res.status(500).json({ error: 'Failed to remove avatar' });
    }
});

// ── OAuth: GitHub ────────────────────────────────────────────────────────────

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3001';

// GET /api/auth/github — redirect to GitHub authorization
router.get('/github', (req: Request, res: Response) => {
    if (!GITHUB_CLIENT_ID) {
        return res.status(503).json({ error: 'GitHub OAuth not configured' });
    }

    const redirectUri = `${API_URL}/api/auth/github/callback`;
    const scope = 'read:user user:email';
    const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;

    res.redirect(url);
});

// GET /api/auth/github/callback — exchange code for tokens
router.get('/github/callback', async (req: Request, res: Response) => {
    try {
        const { code } = req.query;
        if (!code) return res.redirect(`${FRONTEND_URL}/login?error=missing_code`);

        // Exchange code for access token
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                client_secret: GITHUB_CLIENT_SECRET,
                code,
            }),
        });
        const tokenData = await tokenRes.json() as any;

        if (!tokenData.access_token) {
            log.error('GitHub OAuth token exchange failed', tokenData);
            return res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
        }

        // Fetch user profile
        const [profileRes, emailsRes] = await Promise.all([
            fetch('https://api.github.com/user', {
                headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
            }),
            fetch('https://api.github.com/user/emails', {
                headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
            }),
        ]);

        const profile = await profileRes.json() as any;
        const emails = await emailsRes.json() as any[];

        const primaryEmail = emails?.find((e: any) => e.primary && e.verified)?.email
            || emails?.[0]?.email
            || profile.email;

        if (!primaryEmail) {
            return res.redirect(`${FRONTEND_URL}/login?error=no_email`);
        }

        const githubId = String(profile.id);
        const name = profile.name || profile.login || 'GitHub User';
        const avatarUrl = profile.avatar_url || null;

        // Find or create user
        let user = await userService.findByOAuthId('github', githubId);

        if (!user) {
            // Check if email already exists (link accounts)
            const existingUser = await userService.findByEmail(primaryEmail);
            if (existingUser) {
                user = await userService.linkOAuth(existingUser.id, 'github', githubId, avatarUrl);
            } else {
                user = await userService.createOAuthUser(primaryEmail, name, 'github', githubId, avatarUrl);
                // Send welcome email (non-blocking)
                sendWelcomeEmail(primaryEmail, name).catch(err =>
                    log.warn('Welcome email failed', err)
                );
            }
        }

        if (!user) {
            return res.redirect(`${FRONTEND_URL}/login?error=account_creation_failed`);
        }

        // Generate JWT tokens
        const tokens = await generateTokens(user.id, user.email);

        // Redirect to frontend callback page with tokens
        const params = new URLSearchParams({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
        });

        res.redirect(`${FRONTEND_URL}/auth/callback?${params.toString()}`);
    } catch (error) {
        log.error('GitHub OAuth callback error', error);
        res.redirect(`${FRONTEND_URL}/login?error=oauth_error`);
    }
});

// ── OAuth: Google ────────────────────────────────────────────────────────────

// GET /api/auth/google — redirect to Google authorization
router.get('/google', (req: Request, res: Response) => {
    if (!GOOGLE_CLIENT_ID) {
        return res.status(503).json({ error: 'Google OAuth not configured' });
    }

    const redirectUri = `${API_URL}/api/auth/google/callback`;
    const scope = 'openid email profile';
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;

    res.redirect(url);
});

// GET /api/auth/google/callback — exchange code for tokens
router.get('/google/callback', async (req: Request, res: Response) => {
    try {
        const { code } = req.query;
        if (!code) return res.redirect(`${FRONTEND_URL}/login?error=missing_code`);

        const redirectUri = `${API_URL}/api/auth/google/callback`;

        // Exchange code for access token
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: code as string,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }).toString(),
        });
        const tokenData = await tokenRes.json() as any;

        if (!tokenData.access_token) {
            log.error('Google OAuth token exchange failed', tokenData);
            return res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
        }

        // Fetch user profile
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const profile = await profileRes.json() as any;

        if (!profile.email) {
            return res.redirect(`${FRONTEND_URL}/login?error=no_email`);
        }

        const googleId = String(profile.id);
        const name = profile.name || 'Google User';
        const avatarUrl = profile.picture || null;

        // Find or create user
        let user = await userService.findByOAuthId('google', googleId);

        if (!user) {
            const existingUser = await userService.findByEmail(profile.email);
            if (existingUser) {
                user = await userService.linkOAuth(existingUser.id, 'google', googleId, avatarUrl);
            } else {
                user = await userService.createOAuthUser(profile.email, name, 'google', googleId, avatarUrl);
                sendWelcomeEmail(profile.email, name).catch(err =>
                    log.warn('Welcome email failed', err)
                );
            }
        }

        if (!user) {
            return res.redirect(`${FRONTEND_URL}/login?error=account_creation_failed`);
        }

        const tokens = await generateTokens(user.id, user.email);
        const params = new URLSearchParams({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
        });

        res.redirect(`${FRONTEND_URL}/auth/callback?${params.toString()}`);
    } catch (error) {
        log.error('Google OAuth callback error', error);
        res.redirect(`${FRONTEND_URL}/login?error=oauth_error`);
    }
});


export default router;

