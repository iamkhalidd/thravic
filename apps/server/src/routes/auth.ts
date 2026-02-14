import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { registerSchema, loginSchema, refreshSchema } from '../validators/auth';
import * as userService from '../services/userService';
import { getJwtSecret, getJwtRefreshSecret } from '../config/security';
import * as tokenStore from '../services/tokenStore';

const router = Router();

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
        console.error('Register error:', error);
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
        console.error('Login error:', error);
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
        console.error('Update preferences error:', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});


export default router;
