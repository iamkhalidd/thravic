// TrackFlow Analytics - Payment Routes (Paystack Integration)
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

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_BASE  = 'https://api.paystack.co';

// Prices in the smallest currency unit (USD cents for Paystack).
// Paystack supports USD — set your Paystack dashboard to a USD-enabled integration.
const PLAN_PRICES_CENTS: Record<string, number> = {
    pro:    29_00,    // $29 / month
    agency: 79_00,    // $79 / month
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments/plans
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plans', (_req: Request, res: Response) => {
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

        res.json({
            success: true,
            subscription: {
                plan: subscription.plan,
                status: subscription.status,
                eventsUsed: subscription.events_used,
                eventsLimit: subscription.events_limit,
                domainsLimit: subscription.domains_limit,
                currentPeriodEnd: subscription.current_period_end,
                features: PLAN_FEATURES[subscription.plan as PlanName] ?? PLAN_FEATURES['free'],
            },
        });
    } catch (error) {
        log.error('Error getting subscription', error);
        res.status(500).json({ error: 'Failed to get subscription' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/checkout
// Initialises a Paystack transaction. Returns { checkoutUrl } so the
// frontend can redirect the user to Paystack's hosted payment page.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/checkout', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        if (!PAYSTACK_SECRET) {
            return res.status(400).json({ error: 'Paystack not configured' });
        }

        const { plan } = req.body;
        const userId = req.userId!;
        const userEmail = req.email!;

        if (!plan || !['pro', 'agency'].includes(plan)) {
            return res.status(400).json({ error: 'Invalid plan' });
        }

        const amountCents = PLAN_PRICES_CENTS[plan];
        if (!amountCents) {
            return res.status(400).json({ error: `Price not configured for ${plan} plan` });
        }

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

        const paystackRes = await axios.post(
            `${PAYSTACK_BASE}/transaction/initialize`,
            {
                email: userEmail,
                amount: amountCents,
                currency: 'USD',
                callback_url: `${frontendUrl}/dashboard/settings?payment=success`,
                metadata: {
                    userId,
                    plan,
                    cancel_action: `${frontendUrl}/dashboard/settings?payment=canceled`,
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET}`,
                    'Content-Type': 'application/json',
                },
            },
        );

        const { authorization_url, reference } = paystackRes.data.data;

        log.info(`Paystack checkout initiated for user ${userId}, plan=${plan}, ref=${reference}`);

        res.json({ success: true, checkoutUrl: authorization_url, reference });
    } catch (error: any) {
        log.error('Error creating Paystack checkout', error?.response?.data ?? error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/verify
// Called by the frontend after Paystack redirects back (using ?reference=...)
// to confirm the payment succeeded server-side before showing a success UI.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        if (!PAYSTACK_SECRET) {
            return res.status(400).json({ error: 'Paystack not configured' });
        }

        const { reference } = req.body;
        if (!reference) {
            return res.status(400).json({ error: 'Reference is required' });
        }

        const verifyRes = await axios.get(
            `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
            { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } },
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
        res.status(500).json({ error: 'Failed to verify payment' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/webhook
// Paystack sends HMAC-SHA512 signed events. We verify the signature and
// handle charge.success to upgrade the user's subscription.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/webhook', async (req: Request, res: Response) => {
    try {
        const secret = process.env.PAYSTACK_WEBHOOK_SECRET || PAYSTACK_SECRET;
        if (!secret) {
            log.warn('Paystack webhook secret not configured');
            return res.status(400).json({ error: 'Webhook not configured' });
        }

        // Verify signature
        const signature = req.headers['x-paystack-signature'] as string;
        const hash = crypto
            .createHmac('sha512', secret)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash !== signature) {
            log.warn('Paystack webhook signature mismatch');
            return res.status(401).json({ error: 'Invalid signature' });
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
        res.status(500).json({ error: 'Webhook handler failed' });
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
