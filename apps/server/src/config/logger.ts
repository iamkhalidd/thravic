// ──────────────────────────────────────────────
// TrackFlow — Structured Logger
// Production-grade logging with JSON output in production
// and human-readable output in development.
// ──────────────────────────────────────────────

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
}

interface LogEntry {
    timestamp: string;
    level: string;
    context: string;
    message: string;
    data?: Record<string, unknown>;
    error?: {
        message: string;
        stack?: string;
    };
}

const LOG_LEVEL_MAP: Record<string, LogLevel> = {
    error: LogLevel.ERROR,
    warn: LogLevel.WARN,
    info: LogLevel.INFO,
    debug: LogLevel.DEBUG,
};

const currentLevel: LogLevel =
    LOG_LEVEL_MAP[process.env.LOG_LEVEL?.toLowerCase() || ''] ?? LogLevel.INFO;

const isProd = process.env.NODE_ENV === 'production';

function formatError(err: unknown): { message: string; stack?: string } | undefined {
    if (!err) return undefined;
    if (err instanceof Error) {
        return { message: err.message, stack: isProd ? undefined : err.stack };
    }
    return { message: String(err) };
}

function write(level: LogLevel, levelStr: string, context: string, message: string, data?: Record<string, unknown>, err?: unknown): void {
    if (level > currentLevel) return;

    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: levelStr,
        context,
        message,
        data,
        error: formatError(err),
    };

    if (isProd) {
        // Structured JSON — one line per log for log aggregators (Railway, Datadog, etc.)
        const output = JSON.stringify(entry);
        if (level <= LogLevel.ERROR) {
            process.stderr.write(output + '\n');
        } else {
            process.stdout.write(output + '\n');
        }
    } else {
        // Human-readable format for local development
        const prefix = `[${entry.timestamp}] [${levelStr.toUpperCase()}] [${context}]`;
        const parts = [prefix, message];
        if (data && Object.keys(data).length > 0) {
            parts.push(JSON.stringify(data, null, 2));
        }
        if (entry.error) {
            parts.push(`Error: ${entry.error.message}`);
            if (entry.error.stack) parts.push(entry.error.stack);
        }

        const line = parts.join(' ');
        if (level <= LogLevel.WARN) {
            console.error(line);
        } else {
            console.log(line);
        }
    }
}

/**
 * Create a contextual logger for a specific module/service.
 *
 * Usage:
 *   const log = createLogger('Auth');
 *   log.info('User logged in', { userId: '123' });
 *   log.error('Login failed', error);
 */
export function createLogger(context: string) {
    return {
        error(message: string, err?: unknown, data?: Record<string, unknown>) {
            write(LogLevel.ERROR, 'error', context, message, data, err);
        },
        warn(message: string, data?: Record<string, unknown>) {
            write(LogLevel.WARN, 'warn', context, message, data);
        },
        info(message: string, data?: Record<string, unknown>) {
            write(LogLevel.INFO, 'info', context, message, data);
        },
        debug(message: string, data?: Record<string, unknown>) {
            write(LogLevel.DEBUG, 'debug', context, message, data);
        },
    };
}

/** Default application-level logger */
export const logger = createLogger('App');
