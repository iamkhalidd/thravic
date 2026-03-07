// ──────────────────────────────────────────────────────────────
// Thravic — Public Announcements Route
//
// Serves the current admin-authored announcement to the customer
// dashboard. No auth required — the customer app polls this on
// every page load.
// ──────────────────────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { getSetting, isEnabled } from '../services/settingsService';

const router = Router();

export type AnnouncementSeverity = 'info' | 'warning' | 'critical';

// GET /api/announcements/active
// Returns the active announcement or null.
router.get('/active', async (_req: Request, res: Response) => {
    try {
        const enabled = await isEnabled('announcement.enabled');
        if (!enabled) {
            res.json({ announcement: null });
            return;
        }

        const [message, severity] = await Promise.all([
            getSetting<string>('announcement.message'),
            getSetting<AnnouncementSeverity>('announcement.severity'),
        ]);

        if (!message) {
            res.json({ announcement: null });
            return;
        }

        res.json({
            announcement: {
                message,
                severity: severity ?? 'info',
            },
        });
    } catch {
        // Fail silently — never break the customer dashboard over an announcement
        res.json({ announcement: null });
    }
});

export default router;
