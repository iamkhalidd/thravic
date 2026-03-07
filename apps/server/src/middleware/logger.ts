// ──────────────────────────────────────────────
// Thravic — Structured Request Logger
// ──────────────────────────────────────────────
import { Request, Response, NextFunction } from 'express';

/**
 * Request logging middleware.
 * Logs method, path, status code, response time, and content length.
 * In production, outputs JSON for log aggregator ingestion.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    const { method, originalUrl } = req;

    // Hook into response finish
    res.on('finish', () => {
        const duration = Date.now() - start;
        const { statusCode } = res;
        const contentLength = res.get('Content-Length') || '-';

        if (process.env.NODE_ENV === 'production') {
            // Structured JSON for log aggregation
            console.log(JSON.stringify({
                level: statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
                method,
                path: originalUrl,
                status: statusCode,
                duration_ms: duration,
                content_length: contentLength,
                timestamp: new Date().toISOString(),
            }));
        } else {
            // Human-readable for development
            const statusColor =
                statusCode >= 500 ? '\x1b[31m' :  // red
                    statusCode >= 400 ? '\x1b[33m' :  // yellow
                        statusCode >= 300 ? '\x1b[36m' :  // cyan
                            '\x1b[32m';                        // green
            const reset = '\x1b[0m';
            console.log(
                `${method.padEnd(7)} ${statusColor}${statusCode}${reset} ${originalUrl} ${duration}ms`
            );
        }
    });

    next();
}

export const logger = {
    info: console.log,
    warn: console.warn,
    error: console.error,
};

