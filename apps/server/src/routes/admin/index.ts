// Admin Routes Index — single import point for all admin routes
// adminAuth is applied GLOBALLY here so every sub-route is protected
import { Router } from 'express';
import { adminAuth } from '../../middleware/adminAuth';

import dashboardRoutes from './dashboard';
import userRoutes from './users';
import domainRoutes from './domains';
import subscriptionRoutes from './subscriptions';
import eventRoutes from './events';
import systemRoutes from './system';
import auditRoutes from './audit';
import settingsRoutes from './settings';
import retentionRoutes from './retention';
import exportRoutes from './export';

const router = Router();

// Global admin role check — runs before ANY /api/admin/* route
router.use(adminAuth);

router.use('/dashboard', dashboardRoutes);
router.use('/users', userRoutes);
router.use('/domains', domainRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/events', eventRoutes);
router.use('/system', systemRoutes);
router.use('/audit', auditRoutes);
router.use('/settings', settingsRoutes);
router.use('/retention', retentionRoutes);
router.use('/export', exportRoutes);

export default router;
