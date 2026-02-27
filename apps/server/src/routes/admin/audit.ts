// Admin Audit Route — View admin activity log
import { Router, Response } from 'express';
import { adminAuth } from '../../middleware/adminAuth';
import { AuthRequest } from '../../middleware/auth';
import { getAuditLog } from '../../services/auditService';
import { createLogger } from '../../config/logger';

const log = createLogger('Admin:Audit');
const router = Router();

// GET /api/admin/audit — paginated audit log
router.get('/', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const result = await getAuditLog({
            adminId: req.query.adminId as string,
            action: req.query.action as string,
            targetType: req.query.targetType as string,
            limit: parseInt((req.query.limit as string) || '50'),
            offset: parseInt((req.query.offset as string) || '0')
        });

        res.json(result);
    } catch (error) {
        log.error('Audit log error', error);
        res.status(500).json({ error: 'Failed to load audit log' });
    }
});

export default router;
