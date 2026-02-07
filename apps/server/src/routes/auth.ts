import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// In-memory storage (replace with PostgreSQL in production)
interface User {
    id: string;
    email: string;
    password: string;
    name: string;
    createdAt: Date;
    subscription: 'free' | 'growth' | 'pro' | 'enterprise';
}

export const users: Map<string, User> = new Map();
const refreshTokens: Set<string> = new Set();

// Validation schemas
const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(2)
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string()
});

// Generate tokens
function generateTokens(userId: string, email: string) {
    const accessToken = jwt.sign(
        { userId, email },
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    );

    const refreshToken = jwt.sign(
        { userId, email },
        process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );

    refreshTokens.add(refreshToken);

    return { accessToken, refreshToken };
}

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { email, password, name } = registerSchema.parse(req.body);

        // Check if user exists
        const existingUser = Array.from(users.values()).find(u => u.email === email);
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create user
        const user: User = {
            id: uuidv4(),
            email,
            password: hashedPassword,
            name,
            createdAt: new Date(),
            subscription: 'free'
        };

        users.set(user.id, user);

        // Generate tokens
        const tokens = generateTokens(user.id, user.email);

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

        // Find user
        const user = Array.from(users.values()).find(u => u.email === email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate tokens
        const tokens = generateTokens(user.id, user.email);

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
router.post('/refresh', (req: Request, res: Response) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken || !refreshTokens.has(refreshToken)) {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        const decoded = jwt.verify(
            refreshToken,
            process.env.JWT_REFRESH_SECRET || 'default-refresh-secret'
        ) as { userId: string; email: string };

        // Remove old refresh token
        refreshTokens.delete(refreshToken);

        // Generate new tokens
        const tokens = generateTokens(decoded.userId, decoded.email);

        res.json(tokens);
    } catch (error) {
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (refreshToken) {
        refreshTokens.delete(refreshToken);
    }

    res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authenticate, (req: AuthRequest, res: Response) => {
    const user = users.get(req.userId!);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        subscription: user.subscription,
        createdAt: user.createdAt
    });
});

export default router;
