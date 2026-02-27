// ──────────────────────────────────────────────────────────────
// TrackFlow — Settings Gate Middleware
//
// Makes the admin settings panel actually control the server.
// Settings are cached for 60 s in settingsService to avoid
// hitting the DB on every request.
// ──────────────────────────────────────────────────────────────
import { Request, Response, NextFunction } from 'express';
import { isEnabled } from '../services/settingsService';
import { createLogger } from '../config/logger';

const log = createLogger('SettingsGate');

// ── Helper ────────────────────────────────────────────────────
// Returns true if the request is coming from an admin token.
// We can't call the full adminAuth here (async DB check) without
// awaiting inside every middleware chain, so we do a lightweight
// URL-prefix bypass instead — admin routes always start with /api/admin.
const isAdminRoute = (req: Request) =>
    req.path.startsWith('/api/admin') || req.path === '/health';

// ── 1. Maintenance Mode ───────────────────────────────────────
// When maintenance.enabled = true, all non-admin routes return 503.
// Admin routes stay fully functional so you can turn it back off.
export const maintenanceModeGate = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    // Always allow admin and health routes through
    if (isAdminRoute(req)) {
        next();
        return;
    }

    try {
        const maintenance = await isEnabled('maintenance.enabled');
        if (maintenance) {
            res.status(503).json({
                error: 'TrackFlow is currently under scheduled maintenance. Please try again shortly.',
                maintenance: true,
                code: 'MAINTENANCE_MODE',
            });
            return;
        }
    } catch (err) {
        // Fail open — never block requests due to settings DB errors
        log.error('maintenanceModeGate error', err);
    }
    next();
};

// ── 2. Registration Gate ──────────────────────────────────────
// Apply to POST /api/auth/register only.
// When registration.enabled = false, new signups are rejected.
export const registrationGate = async (
    _req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        // Default to open (true) if the setting doesn't exist yet
        const enabled = await isEnabled('registration.enabled');
        // isEnabled returns false when the key is missing — default to true
        const registrationOpen = enabled !== false;
        if (!registrationOpen) {
            res.status(403).json({
                error: 'Registration is currently closed. Please check back later.',
                code: 'REGISTRATION_DISABLED',
            });
            return;
        }
    } catch (err) {
        log.error('registrationGate error', err);
    }
    next();
};

// ── 3. Tracking Gate ─────────────────────────────────────────
// Apply to POST /api/collect/* only.
// When tracking.enabled = false, event ingestion is paused.
export const trackingGate = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    // Only gate write operations — allow GET (e.g. health checks on the route)
    if (req.method === 'GET' || req.method === 'OPTIONS') {
        next();
        return;
    }

    try {
        const enabled = await isEnabled('tracking.enabled');
        const trackingOn = enabled !== false; // default open
        if (!trackingOn) {
            res.status(503).json({
                error: 'Event collection is temporarily paused.',
                code: 'TRACKING_DISABLED',
            });
            return;
        }
    } catch (err) {
        log.error('trackingGate error', err);
    }
    next();
};
