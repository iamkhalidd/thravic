// ──────────────────────────────────────────────
// Thravic — Feature Gate Middleware
//
// Gates routes by subscription plan.
// Returns 403 { error, upgrade: true, requiredPlan }
// when the user's plan does not include the feature.
// ──────────────────────────────────────────────
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { queryOne } from '../db';
import { PLAN_FEATURES, PlanFeature, getPlanForFeature } from '../config/plans';
import { createLogger } from '../config/logger';

const log = createLogger('FeatureGate');

/**
 * Middleware factory — use after `authenticate`.
 *
 * @example
 * router.get('/...', authenticate, requireFeature('heatmaps'), handler)
 */
export const requireFeature = (feature: PlanFeature) =>
    async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const userId = req.userId;
            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            // If DB is not available, default to free plan
            if (!process.env.DATABASE_URL) {
                const freeFeatures = PLAN_FEATURES['free'];
                if (!freeFeatures.includes(feature)) {
                    res.status(403).json({
                        error: `The "${feature}" feature is not available on the Free plan.`,
                        upgrade: true,
                        requiredPlan: getPlanForFeature(feature),
                        currentPlan: 'free',
                    });
                    return;
                }
                next();
                return;
            }

            // Determine whose subscription to check.
            // If domainId is present (e.g., /api/heatmaps/:domainId), check the DOMAIN OWNER's subscription.
            // This ensures invited team members can access pro features of the domains they are invited to.
            const domainId = req.params?.domainId || req.query?.domainId;
            let targetUserId = userId;

            if (domainId && typeof domainId === 'string') {
                const domainRow = await queryOne<{ user_id: string }>(
                    'SELECT user_id FROM domains WHERE id = $1',
                    [domainId]
                );
                if (domainRow) {
                    targetUserId = domainRow.user_id;
                }
            }

            // Fetch the target user's current plan from DB
            const row = await queryOne<{ plan: string }>(
                `SELECT COALESCE(
                    (SELECT plan FROM subscriptions WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1),
                    'free'
                ) AS plan`,
                [targetUserId]
            );

            const rawPlan = row?.plan ?? 'free';
            const plan = rawPlan.toLowerCase().trim() as keyof typeof PLAN_FEATURES;
            const allowedFeatures = PLAN_FEATURES[plan] ?? PLAN_FEATURES['free'];

            if (!allowedFeatures.includes(feature)) {
                const requiredPlan = getPlanForFeature(feature);
                log.info(`Feature gate denied: user ${userId} (plan=${plan}) tried to access "${feature}"`);
                res.status(403).json({
                    error: `The "${feature}" feature requires the ${requiredPlan} plan or above.`,
                    upgrade: true,
                    requiredPlan,
                    currentPlan: plan,
                });
                return;
            }

            next();
        } catch (err) {
            log.error('Feature gate error', err);
            // Fail open in dev, fail closed in production
            if (process.env.NODE_ENV === 'production') {
                res.status(500).json({ error: 'Failed to verify subscription' });
            } else {
                next();
            }
        }
    };
