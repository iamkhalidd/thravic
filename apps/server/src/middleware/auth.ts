import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/security';
import redisClient from '../db/redis';

export interface AuthRequest extends Request {
    userId?: string;
    email?: string;
}

export interface JwtPayload {
    userId: string;
    email: string;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];

        // Check Redis blacklist for revoked tokens (e.g. from logout)
        const isBlacklisted = await redisClient.get(`bl:${token}`);
        if (isBlacklisted) {
            return res.status(401).json({ error: 'Token revoked' });
        }

        const secret = getJwtSecret();
        const decoded = jwt.verify(token, secret) as JwtPayload;

        req.userId = decoded.userId;
        req.email = decoded.email;

        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            
            const isBlacklisted = await redisClient.get(`bl:${token}`);
            if (!isBlacklisted) {
                const secret = getJwtSecret();
                const decoded = jwt.verify(token, secret) as JwtPayload;
                req.userId = decoded.userId;
                req.email = decoded.email;
            }
        }

        next();
    } catch (error) {
        next();
    }
};
