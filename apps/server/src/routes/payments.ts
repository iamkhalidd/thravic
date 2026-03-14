// Thravic Analytics - Payment Routes (Paystack Integration)
// Uses Paystack's transaction/initialize API for one-time plan upgrades.
// Webhook fires on charge.success → upgrades user subscription in DB.

import { Router, Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { createLogger } from '../config/logger';
import { PLAN_LIMITS, PLAN_FEATURES, PlanName } from '../config/plans';
import { authenticate, AuthRequest } from '../middleware/auth';
import { query, queryOne } from '../db';
import { sendPaymentReceiptEmail } from '../services/emailService';

const log = createLogger('Payments');
const router = Router();

// Read at request time, NOT module load — ensures env changes are picked up after restart
function getPaystackSecret(): string {
    return process.env.PAYSTACK_SECRET_KEY || '';
}
const PAYSTACK_BASE  = 'https://api.paystack.co';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments/status  (diagnostic — no auth required)
// Returns config status without exposing secrets
// ─────────────────────────────────────────────────────────────────────────────
router.get('/status', (_req: Request, res: Response) => {
    const secret = getPaystackSecret();
    const frontendUrl = process.env.FRONTEND_URL || 'NOT SET';
    const serverUrl = process.env.SERVER_URL || 'NOT SET';
    res.json({
        paystackConfigured: !!secret,
        paystackKeyPrefix: secret ? secret.substring(0, 8) + '...' : 'EMPTY',
        frontendUrl,
        serverUrl,
        callbackUrl: `${frontendUrl}/dashboard/settings?payment=success`,
        webhookUrl: `${serverUrl}/api/payments/webhook`,
    });
});


// Fallback prices (used only if plans table doesn't exist yet)
const FALLBACK_PRICES: Record<string, { price: number; currency: string }> = {
    pro:    { price: 45_000_00, currency: 'NGN' },
    agency: { price: 125_000_00, currency: 'NGN' },
};

// Helper: fetch a plan from DB with fallback
async function getPlanFromDB(planId: string) {
    try {
        const plan = await queryOne<{
            id: string; name: string; price: number; currency: string;
            events_limit: number; domains_limit: number; retention_days: number;
            features: string[]; active: boolean;
        }>('SELECT * FROM plans WHERE id = $1 AND active = true', [planId]);
        return plan;
    } catch {
        return null; // table might not exist yet
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments/plans
// Returns active plans from the database (with fallback to config)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plans', async (_req: Request, res: Response) => {
    try {
        const dbPlans = await query(
            'SELECT * FROM plans WHERE active = true ORDER BY sort_order ASC'
        );
        if (dbPlans && dbPlans.length > 0) {
            return res.json({ success: true, plans: dbPlans });
        }
    } catch {
        // plans table might not exist yet — fall through to hardcoded
    }

    // Fallback to config-based plans
    const plans = Object.entries(PLAN_LIMITS).map(([key, tier]) => ({
        id: key,
        ...tier,
        features: PLAN_FEATURES[key as PlanName],
    }));
    res.json({ success: true, plans });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments/current
// ─────────────────────────────────────────────────────────────────────────────
router.get('/current', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;

        if (!process.env.DATABASE_URL) {
            const tier = PLAN_LIMITS.free;
            return res.json({
                success: true,
                subscription: {
                    plan: 'free',
                    status: 'active',
                    eventsUsed: 0,
                    eventsLimit: tier.eventsLimit,
                    domainsLimit: tier.domainsLimit,
                    features: PLAN_FEATURES['free'],
                },
            });
        }

        const subscription = await queryOne(`
            SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
        `, [userId]);

        if (!subscription) {
            const tier = PLAN_LIMITS.free;
            await query(`
                INSERT INTO subscriptions (user_id, plan, events_limit, domains_limit)
                VALUES ($1, 'free', $2, $3)
            `, [userId, tier.eventsLimit, tier.domainsLimit]);

            return res.json({
                success: true,
                subscription: {
                    plan: 'free',
                    status: 'active',
                    eventsUsed: 0,
                    eventsLimit: tier.eventsLimit,
                    domainsLimit: tier.domainsLimit,
                    features: PLAN_FEATURES['free'],
                },
            });
        }

        const planKey = (subscription.plan || '').toLowerCase().trim() as PlanName;

        res.json({
            success: true,
            subscription: {
                plan: subscription.plan,
                status: subscription.status,
                eventsUsed: subscription.events_used,
                eventsLimit: subscription.events_limit,
                domainsLimit: subscription.domains_limit,
                currentPeriodEnd: subscription.current_period_end,
                features: PLAN_FEATURES[planKey] ?? PLAN_FEATURES['free'],
            },
        });
    } catch (error) {
        log.error('Error getting subscription', error);
        res.status(500).json({ error: 'Failed to get subscription' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/validate-promo
// Validates a promo code and returns the discount details. Rate-limited.
// ─────────────────────────────────────────────────────────────────────────────
async function validatePromoCode(code: string, plan: string, userId: string) {
    const promo = await queryOne<any>(
        `SELECT * FROM promo_codes WHERE code = $1 AND active = true FOR UPDATE`,
        [code.toUpperCase().trim()]
    );

    if (!promo) return { valid: false, error: 'Invalid or expired code' };

    const now = new Date();
    if (promo.starts_at && new Date(promo.starts_at) > now) {
        return { valid: false, error: 'Invalid or expired code' };
    }
    if (promo.expires_at && new Date(promo.expires_at) < now) {
        return { valid: false, error: 'Invalid or expired code' };
    }
    if (promo.max_uses && promo.used_count >= promo.max_uses) {
        return { valid: false, error: 'Invalid or expired code' };
    }

    // Check applicable plans
    if (promo.applicable_plans && promo.applicable_plans.length > 0 && !promo.applicable_plans.includes(plan)) {
        return { valid: false, error: 'This code is not valid for the selected plan' };
    }

    // Check per-user limit
    const userRedemptions = await queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM promo_redemptions WHERE promo_code_id = $1 AND user_id = $2',
        [promo.id, userId]
    );
    if (parseInt(userRedemptions?.count || '0') >= promo.max_per_user) {
        return { valid: false, error: 'You have already used this code' };
    }

    return { valid: true, promo };
}

router.post('/validate-promo', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { code, plan } = req.body;
        if (!code || !plan) {
            return res.status(400).json({ valid: false, error: 'Code and plan are required' });
        }

        const result = await validatePromoCode(code, plan, req.userId!);
        if (!result.valid) {
            return res.json({ valid: false, error: result.error });
        }

        const promo = result.promo;
        // Fetch plan price to show preview
        const dbPlan = await getPlanFromDB(plan);
        const originalPrice = dbPlan ? dbPlan.price : (FALLBACK_PRICES[plan]?.price || 0) / 100;

        let discountedPrice = originalPrice;
        if (promo.discount_type === 'percentage') {
            discountedPrice = Math.round(originalPrice * (1 - promo.discount_value / 100));
        } else {
            discountedPrice = Math.max(0, originalPrice - promo.discount_value);
        }

        res.json({
            valid: true,
            discount_type: promo.discount_type,
            discount_value: promo.discount_value,
            original_price: originalPrice,
            discounted_price: discountedPrice,
            currency: dbPlan?.currency || 'NGN',
        });
    } catch (error) {
        log.error('Promo validation error', error);
        res.status(500).json({ valid: false, error: 'Failed to validate code' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/checkout
// Initialises a Paystack transaction. Returns { checkoutUrl } so the
// frontend can redirect the user to Paystack's hosted payment page.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/checkout', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const secret = getPaystackSecret();
        if (!secret) {
            log.warn('PAYSTACK_SECRET_KEY env var is empty or not set');
            return res.status(503).json({
                error: 'Payment service not configured. PAYSTACK_SECRET_KEY is missing.',
                debug: { envKeySet: !!process.env.PAYSTACK_SECRET_KEY }
            });
        }

        const { plan, promoCode } = req.body;
        const userId = req.userId!;
        const userEmail = req.email!;

        log.info(`Checkout request: user=${userId}, email=${userEmail}, plan=${plan}, promo=${promoCode || 'none'}`);

        // Fetch plan from DB for dynamic pricing
        const dbPlan = await getPlanFromDB(plan);
        const originalPriceUnits = dbPlan ? dbPlan.price : (FALLBACK_PRICES[plan]?.price || 0) / 100;
        const currency = dbPlan?.currency || FALLBACK_PRICES[plan]?.currency || 'NGN';
        let amountKobo = dbPlan ? dbPlan.price * 100 : FALLBACK_PRICES[plan]?.price;

        if (!amountKobo) {
            return res.status(400).json({ error: `Price not configured for ${plan} plan` });
        }

        // Apply promo code discount if provided
        let promoRecord: any = null;
        if (promoCode) {
            const promoResult = await validatePromoCode(promoCode, plan, userId);
            if (!promoResult.valid) {
                return res.status(400).json({ error: promoResult.error });
            }
            promoRecord = promoResult.promo;

            if (promoRecord.discount_type === 'percentage') {
                amountKobo = Math.round(amountKobo * (1 - promoRecord.discount_value / 100));
            } else {
                // Flat discount in whole currency units → convert to kobo
                amountKobo = Math.max(100, amountKobo - promoRecord.discount_value * 100);
            }
            log.info(`Promo ${promoCode} applied: original=${originalPriceUnits}, discounted kobo=${amountKobo}`);
        }

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const callbackUrl = `${frontendUrl}/dashboard/settings?payment=success`;

        log.info(`Paystack init: amount=${amountKobo}, currency=${currency}, callback=${callbackUrl}`);

        const paystackRes = await axios.post(
            `${PAYSTACK_BASE}/transaction/initialize`,
            {
                email: userEmail,
                amount: amountKobo,
                currency,
                callback_url: callbackUrl,
                metadata: {
                    userId,
                    plan,
                    promoCode: promoCode || null,
                    promoId: promoRecord?.id || null,
                    cancel_action: `${frontendUrl}/dashboard/settings?payment=canceled`,
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${secret}`,
                    'Content-Type': 'application/json',
                },
            },
        );

        const { authorization_url, reference } = paystackRes.data.data;

        // Record promo redemption and update usage count
        if (promoRecord) {
            try {
                await query(
                    `INSERT INTO promo_redemptions (promo_code_id, user_id, plan, original_amount, discounted_amount, paystack_ref)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [promoRecord.id, userId, plan, originalPriceUnits * 100, amountKobo, reference]
                );
                await query('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = $1', [promoRecord.id]);
            } catch (e) {
                log.warn('Failed to record promo redemption', { error: e instanceof Error ? e.message : String(e) });
            }
        }

        // Log payment in history
        try {
            await query(
                `INSERT INTO payment_history (user_id, plan, amount, currency, promo_code_id, paystack_ref, status)
                 VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
                [userId, plan, amountKobo, currency, promoRecord?.id || null, reference]
            );
        } catch (e) {
            log.warn('Failed to log payment history', { error: e instanceof Error ? e.message : String(e) });
        }

        log.info(`Paystack checkout initiated: user=${userId}, plan=${plan}, ref=${reference}`);

        res.json({ success: true, checkoutUrl: authorization_url, reference });
    } catch (error: any) {
        const paystackError = error?.response?.data;
        const statusCode = error?.response?.status;
        log.error(`Paystack checkout FAILED [${statusCode}]:`, paystackError ?? error.message);
        
        // Surface the real error to help debugging
        const userMessage = paystackError?.message
            || paystackError?.data?.message
            || 'Something went wrong. Please try again later.';
        
        res.status(500).json({
            error: userMessage,
            debug: {
                paystackStatus: statusCode || null,
                paystackMessage: paystackError?.message || null,
            }
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/verify
// Called by the frontend after Paystack redirects back (using ?reference=...)
// to confirm the payment succeeded server-side before showing a success UI.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const secret = getPaystackSecret();
        if (!secret) {
            log.warn('Paystack secret key not configured');
            return res.status(503).json({ error: 'Payment service temporarily unavailable. Please try again later.' });
        }

        const { reference } = req.body;
        if (!reference) {
            return res.status(400).json({ error: 'Reference is required' });
        }

        const verifyRes = await axios.get(
            `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
            { headers: { Authorization: `Bearer ${secret}` } },
        );

        const txData = verifyRes.data.data;
        if (txData.status !== 'success') {
            return res.status(400).json({ error: 'Payment not successful', status: txData.status });
        }

        const { userId, plan } = txData.metadata as { userId: string; plan: PlanName };

        if (userId && plan && process.env.DATABASE_URL) {
            await upgradeSubscription(userId, plan, reference);
        }

        res.json({ success: true, plan });
    } catch (error: any) {
        log.error('Error verifying Paystack payment', error?.response?.data ?? error);
        res.status(500).json({ error: 'Something went wrong. Please try again later.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/webhook
// Paystack sends HMAC-SHA512 signed events. We verify the signature and
// handle charge.success to upgrade the user's subscription.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/webhook', async (req: Request, res: Response) => {
    try {
        const secret = process.env.PAYSTACK_WEBHOOK_SECRET || getPaystackSecret();
        if (!secret) {
            log.warn('Paystack webhook secret not configured');
            return res.status(503).json({ error: 'Service temporarily unavailable' });
        }

        // Verify signature
        const signature = req.headers['x-paystack-signature'] as string;
        const hash = crypto
            .createHmac('sha512', secret)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash !== signature) {
            log.warn('Paystack webhook signature mismatch');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const event = req.body as { event: string; data: any };
        log.info(`Paystack webhook received: ${event.event}`);

        switch (event.event) {
            case 'charge.success': {
                const { metadata, reference, customer } = event.data;
                const userId: string | undefined = metadata?.userId;
                const plan: PlanName | undefined = metadata?.plan;

                if (userId && plan && process.env.DATABASE_URL) {
                    await upgradeSubscription(userId, plan, reference);
                    log.info(`User ${userId} upgraded to ${plan} via webhook (ref: ${reference})`);
                }

                // Save Paystack customer code if present
                if (userId && customer?.customer_code && process.env.DATABASE_URL) {
                    await query(
                        'UPDATE users SET paystack_customer_code = $1 WHERE id = $2',
                        [customer.customer_code, userId],
                    ).catch(() => {/* column may not exist yet – safe to skip */});
                }
                break;
            }

            case 'subscription.disable': {
                // Paystack subscription disabled → downgrade to free
                const subscriptionCode: string = event.data.subscription_code;
                if (subscriptionCode && process.env.DATABASE_URL) {
                    const freeTier = PLAN_LIMITS.free;
                    await query(`
                        UPDATE subscriptions
                        SET plan = 'free', status = 'canceled',
                            events_limit = $1, domains_limit = $2, updated_at = NOW()
                        WHERE paystack_subscription_code = $3
                    `, [freeTier.eventsLimit, freeTier.domainsLimit, subscriptionCode]);
                    log.info(`Subscription ${subscriptionCode} disabled — downgraded to free`);
                }
                break;
            }

            default:
                log.debug(`Unhandled Paystack event: ${event.event}`);
        }

        // Always respond 200 quickly — Paystack retries if it doesn't get a 2xx
        res.json({ received: true });
    } catch (error) {
        log.error('Paystack webhook error', error);
        res.status(500).json({ error: 'Internal error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments/usage
// ─────────────────────────────────────────────────────────────────────────────
router.get('/usage', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;

        if (!process.env.DATABASE_URL) {
            return res.json({
                success: true,
                usage: {
                    eventsThisMonth: 0,
                    eventsLimit: PLAN_LIMITS.free.eventsLimit,
                    percentUsed: 0,
                },
            });
        }

        const domains = await query<{ id: string }>(
            'SELECT id FROM domains WHERE user_id = $1',
            [userId],
        );

        if (domains.length === 0) {
            return res.json({
                success: true,
                usage: {
                    eventsThisMonth: 0,
                    eventsLimit: PLAN_LIMITS.free.eventsLimit,
                    percentUsed: 0,
                },
            });
        }

        const domainIds = domains.map(d => d.id);
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

        const usageResult = await queryOne<{ total: string }>(`
            SELECT COALESCE(SUM(events_count), 0) as total
            FROM usage_logs
            WHERE domain_id = ANY($1) AND month >= $2
        `, [domainIds, monthStart]);

        const eventsUsed = parseInt(usageResult?.total || '0');
        const subscription = await queryOne<{ events_limit: number }>(
            'SELECT events_limit FROM subscriptions WHERE user_id = $1',
            [userId],
        );

        const eventsLimit = subscription?.events_limit ?? PLAN_LIMITS.free.eventsLimit;
        const percentUsed = eventsLimit > 0 ? Math.round((eventsUsed / eventsLimit) * 100) : 0;

        res.json({
            success: true,
            usage: { eventsThisMonth: eventsUsed, eventsLimit, percentUsed },
        });
    } catch (error) {
        log.error('Error getting usage', error);
        res.status(500).json({ error: 'Failed to get usage' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: upsert subscription in DB and set plan active for 30 days
// ─────────────────────────────────────────────────────────────────────────────
async function upgradeSubscription(userId: string, plan: PlanName, reference: string) {
    const tier = PLAN_LIMITS[plan];
    if (!tier) return;

    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 30);

    await query(
        'UPDATE users SET subscription = $1, paystack_subscription_code = $2 WHERE id = $3',
        [plan, reference, userId],
    ).catch(() => {/* ignore if column missing, handled below */});

    await query(`
        INSERT INTO subscriptions
            (user_id, paystack_subscription_code, plan, status, events_limit, domains_limit, current_period_end)
        VALUES ($1, $2, $3, 'active', $4, $5, $6)
        ON CONFLICT (user_id) DO UPDATE SET
            paystack_subscription_code = $2,
            plan                       = $3,
            status                     = 'active',
            events_limit               = $4,
            domains_limit              = $5,
            current_period_end         = $6,
            updated_at                 = NOW()
    `, [userId, reference, plan, tier.eventsLimit, tier.domainsLimit, periodEnd]);

    // Send payment receipt email (non-blocking)
    const user = await queryOne<{ email: string; name: string }>(
        'SELECT email, name FROM users WHERE id = $1',
        [userId],
    ).catch(() => null);

    if (user) {
        const planPrices: Record<string, number> = { pro: 29, agency: 79 };
        sendPaymentReceiptEmail(
            user.email,
            user.name,
            plan,
            planPrices[plan] ?? 0,
            reference,
        ).catch(err => log.warn('Payment receipt email failed', err));
    }
}

export default router;
