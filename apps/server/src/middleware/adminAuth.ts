// Admin Authentication Middleware
// Extends the standard authenticate middleware to check for admin role

import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/security';
import { queryOne } from '../db';

export interface AdminRequest extends Request {
    userId?: string;
    email?: string;
    adminRole?: string;
}

// Middleware: authenticate + check admin role
export const adminAuth = async (req: any, res: Response, next: NextFunction) => {
    try {
        // 1. Extract and verify JWT (same as authenticate)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, getJwtSecret()) as { userId: string; email: string };

        req.userId = decoded.userId;
        req.email = decoded.email;

        // 2. Check admin role in database
        const user = await queryOne<{ role: string }>(
            'SELECT role FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        req.adminRole = user.role;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

// Middleware: super_admin only (for destructive operations)
export const superAdminAuth = async (req: any, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, getJwtSecret()) as { userId: string; email: string };

        req.userId = decoded.userId;
        req.email = decoded.email;

        const user = await queryOne<{ role: string }>(
            'SELECT role FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (!user || user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Super admin access required' });
        }

        req.adminRole = user.role;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};
