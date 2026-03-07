// ──────────────────────────────────────────────
// Thravic — Centralized Error Handling
// ──────────────────────────────────────────────
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Custom application error with HTTP status code and error code.
 * Throw this from any route or service to get consistent error responses.
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly isOperational: boolean;
    public readonly details?: unknown;

    constructor(
        message: string,
        statusCode: number = 500,
        code: string = 'INTERNAL_ERROR',
        details?: unknown
    ) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        this.details = details;
        Object.setPrototypeOf(this, AppError.prototype);
    }

    // ── Common factory methods ──

    static badRequest(message: string, details?: unknown) {
        return new AppError(message, 400, 'BAD_REQUEST', details);
    }

    static unauthorized(message = 'Unauthorized') {
        return new AppError(message, 401, 'UNAUTHORIZED');
    }

    static forbidden(message = 'Forbidden') {
        return new AppError(message, 403, 'FORBIDDEN');
    }

    static notFound(resource = 'Resource') {
        return new AppError(`${resource} not found`, 404, 'NOT_FOUND');
    }

    static conflict(message: string) {
        return new AppError(message, 409, 'CONFLICT');
    }

    static tooManyRequests(message = 'Too many requests') {
        return new AppError(message, 429, 'TOO_MANY_REQUESTS');
    }

    static internal(message = 'Internal server error') {
        return new AppError(message, 500, 'INTERNAL_ERROR');
    }
}

/**
 * Express error-handling middleware.
 * Place AFTER all routes: `app.use(errorHandler)`
 */
export function errorHandler(
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    // Zod validation errors
    if (err instanceof z.ZodError) {
        res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: err.errors.map(e => ({
                field: e.path.join('.'),
                message: e.message,
            })),
        });
        return;
    }

    // Known application errors
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            error: err.message,
            code: err.code,
            ...(err.details ? { details: err.details } : {}),
        });
        return;
    }

    // PostgreSQL unique constraint violation
    if ((err as any)?.code === '23505') {
        res.status(409).json({
            error: 'Resource already exists',
            code: 'CONFLICT',
        });
        return;
    }

    // PostgreSQL foreign key violation
    if ((err as any)?.code === '23503') {
        res.status(400).json({
            error: 'Referenced resource does not exist',
            code: 'FK_VIOLATION',
        });
        return;
    }

    // Unknown errors — log full stack in dev, hide in prod
    console.error('[ERROR]', err);

    res.status(500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message,
        code: 'INTERNAL_ERROR',
    });
}

/**
 * Async route wrapper — catches rejected promises and passes them to errorHandler.
 * Usage: `router.get('/path', asyncHandler(async (req, res) => { ... }))`
 */
export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
