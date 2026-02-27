// Admin Settings Route — Runtime site configuration
import { Router, Response } from 'express';
import { adminAuth } from '../../middleware/adminAuth';
import { AuthRequest } from '../../middleware/auth';
import { getAllSettings, setSetting } from '../../services/settingsService';
import { logAction } from '../../services/auditService';
import { createLogger } from '../../config/logger';
import { updateSettingSchema } from '../../validators/admin';
import { z } from 'zod';

const log = createLogger('Admin:Settings');
const router = Router();

// GET /api/admin/settings — all settings
router.get('/', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { query: dbQuery } = await import('../../db');
        const rows = await dbQuery(
            'SELECT key, value, updated_at FROM system_settings ORDER BY key'
        );
        res.json({ settings: rows });
    } catch (error) {
        log.error('Settings list error', error);
        res.status(500).json({ error: 'Failed to load settings' });
    }
});

// PUT /api/admin/settings/:key — update a setting
router.put('/:key', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { value } = updateSettingSchema.parse(req.body);

        await setSetting(req.params.key, value, req.userId!);

        await logAction({
            adminId: req.userId!,
            action: 'settings.update',
            targetType: 'setting',
            details: { key: req.params.key, value },
            ipAddress: req.ip
        });

        res.json({ message: 'Setting updated', key: req.params.key, value });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        log.error('Setting update error', error);
        res.status(500).json({ error: 'Failed to update setting' });
    }
});

export default router;
