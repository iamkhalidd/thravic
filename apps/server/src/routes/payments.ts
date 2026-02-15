// TrackFlow Analytics - Payment Routes (Stripe Integration)
// Following MVP Spec: SaaS Pricing & Subscription Management

import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { authenticate, AuthRequest } from '../middleware/auth';
import { query, queryOne } from '../db';

const router = Router();

// Initialize Stripe (only if STRIPE_SECRET_KEY is set)
const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
    : null;

// Pricing tiers from spec
const PRICING_TIERS = {
    free: {
        name: 'Free',
        eventsLimit: 10000,
        domainsLimit: 1,
        retentionDays: 7,
        price: 0
    },
    growth: {
        name: 'Growth',
        eventsLimit: 250000,
        domainsLimit: 5,
        retentionDays: 90,
        price: 39
    },
    pro: {
        name: 'Pro',
        eventsLimit: 2000000,
        domainsLimit: 20,
        retentionDays: 365,
        price: 99
    },
    enterprise: {
        name: 'Enterprise',
        eventsLimit: -1, // Unlimited
        domainsLimit: -1,
        retentionDays: 365,
        price: 299
    }
};

// GET /api/payments/plans - Get available plans
router.get('/plans', (req, res: Response) => {
    res.json({
        success: true,
        plans: PRICING_TIERS
    });
});

// GET /api/payments/current - Get current subscription
router.get('/current', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;

        // Check if database is available
        if (!process.env.DATABASE_URL) {
            // Return mock data for in-memory mode
            return res.json({
                success: true,
                subscription: {
                    plan: 'free',
                    status: 'active',
                    eventsUsed: 0,
                    eventsLimit: PRICING_TIERS.free.eventsLimit,
                    domainsLimit: PRICING_TIERS.free.domainsLimit
                }
            });
        }

        const subscription = await queryOne(`
            SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
        `, [userId]);

        if (!subscription) {
            // Create free subscription if none exists
            const tier = PRICING_TIERS.free;
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
                    domainsLimit: tier.domainsLimit
                }
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
                currentPeriodEnd: subscription.current_period_end
            }
        });
    } catch (error) {
        console.error('Error getting subscription:', error);
        res.status(500).json({ error: 'Failed to get subscription' });
    }
});

// POST /api/payments/checkout - Create Stripe Checkout Session
router.post('/checkout', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        if (!stripe) {
            return res.status(400).json({ error: 'Stripe not configured' });
        }

        const { plan } = req.body;
        const userId = req.userId;
        const userEmail = req.email;

        if (!plan || !['growth', 'pro', 'enterprise'].includes(plan)) {
            return res.status(400).json({ error: 'Invalid plan' });
        }

        // Get or create Stripe customer
        let customerId: string;

        if (process.env.DATABASE_URL) {
            const user = await queryOne<{ stripe_customer_id: string }>(
                'SELECT stripe_customer_id FROM users WHERE id = $1',
                [userId]
            );

            if (user?.stripe_customer_id) {
                customerId = user.stripe_customer_id;
            } else {
                const customer = await stripe.customers.create({
                    email: userEmail,
                    metadata: { userId: userId as string }
                });
                customerId = customer.id;

                await query(
                    'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
                    [customerId, userId]
                );
            }
        } else {
            // In-memory mode: create customer without saving
            const customer = await stripe.customers.create({
                email: userEmail,
                metadata: { userId: userId as string }
            });
            customerId = customer.id;
        }

        // Get price ID from environment
        const priceId = process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];
        if (!priceId) {
            return res.status(400).json({ error: `Price not configured for ${plan} plan` });
        }

        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{
                price: priceId,
                quantity: 1
            }],
            success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/settings?payment=success`,
            cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/settings?payment=canceled`,
            metadata: {
                userId: userId as string,
                plan
            }
        });

        res.json({
            success: true,
            checkoutUrl: session.url
        });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// POST /api/payments/portal - Create Stripe Customer Portal Session
router.post('/portal', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        if (!stripe) {
            return res.status(400).json({ error: 'Stripe not configured' });
        }

        const userId = req.userId;

        if (!process.env.DATABASE_URL) {
            return res.status(400).json({ error: 'Database required for billing portal' });
        }

        const user = await queryOne<{ stripe_customer_id: string }>(
            'SELECT stripe_customer_id FROM users WHERE id = $1',
            [userId]
        );

        if (!user?.stripe_customer_id) {
            return res.status(400).json({ error: 'No billing account found' });
        }

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: user.stripe_customer_id,
            return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/settings`
        });

        res.json({
            success: true,
            portalUrl: portalSession.url
        });
    } catch (error) {
        console.error('Error creating portal session:', error);
        res.status(500).json({ error: 'Failed to create portal session' });
    }
});

// POST /api/payments/webhook - Stripe Webhook Handler
router.post('/webhook', async (req: Request, res: Response) => {
    try {
        if (!stripe) {
            return res.status(400).json({ error: 'Stripe not configured' });
        }

        const sig = req.headers['stripe-signature'] as string;
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!webhookSecret) {
            console.warn('Stripe webhook secret not configured');
            return res.status(400).json({ error: 'Webhook not configured' });
        }

        let event: Stripe.Event;

        try {
            event = stripe.webhooks.constructEvent(
                req.body,
                sig,
                webhookSecret
            );
        } catch (err: any) {
            console.error('Webhook signature verification failed:', err.message);
            return res.status(400).json({ error: 'Invalid signature' });
        }

        // Handle the event
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                const userId = session.metadata?.userId;
                const plan = session.metadata?.plan;

                if (userId && plan && process.env.DATABASE_URL) {
                    const tier = PRICING_TIERS[plan as keyof typeof PRICING_TIERS];

                    // Update user subscription
                    await query(
                        'UPDATE users SET subscription = $1, stripe_subscription_id = $2 WHERE id = $3',
                        [plan, session.subscription, userId]
                    );

                    // Upsert subscription record
                    await query(`
                        INSERT INTO subscriptions (user_id, stripe_subscription_id, plan, status, events_limit, domains_limit)
                        VALUES ($1, $2, $3, 'active', $4, $5)
                        ON CONFLICT (user_id) DO UPDATE SET
                            stripe_subscription_id = $2,
                            plan = $3,
                            status = 'active',
                            events_limit = $4,
                            domains_limit = $5,
                            updated_at = NOW()
                    `, [userId, session.subscription, plan, tier.eventsLimit, tier.domainsLimit]);

                    console.log(`[Payment] User ${userId} upgraded to ${plan}`);
                }
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object as Stripe.Subscription;
                if (process.env.DATABASE_URL) {
                    await query(`
                        UPDATE subscriptions 
                        SET status = $1, current_period_start = $2, current_period_end = $3, updated_at = NOW()
                        WHERE stripe_subscription_id = $4
                    `, [
                        subscription.status,
                        new Date(subscription.current_period_start * 1000),
                        new Date(subscription.current_period_end * 1000),
                        subscription.id
                    ]);
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;
                if (process.env.DATABASE_URL) {
                    // Downgrade to free
                    await query(`
                        UPDATE subscriptions SET plan = 'free', status = 'canceled', events_limit = $1, domains_limit = $2, updated_at = NOW()
                        WHERE stripe_subscription_id = $3
                    `, [PRICING_TIERS.free.eventsLimit, PRICING_TIERS.free.domainsLimit, subscription.id]);

                    await query(`
                        UPDATE users SET subscription = 'free', stripe_subscription_id = NULL
                        WHERE stripe_subscription_id = $1
                    `, [subscription.id]);

                    console.log(`[Payment] Subscription ${subscription.id} canceled, downgraded to free`);
                }
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object as Stripe.Invoice;
                if (process.env.DATABASE_URL && invoice.subscription) {
                    await query(`
                        UPDATE subscriptions SET status = 'past_due', updated_at = NOW()
                        WHERE stripe_subscription_id = $1
                    `, [invoice.subscription]);
                }
                break;
            }

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook handler failed' });
    }
});

// GET /api/payments/usage - Get current usage
router.get('/usage', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;

        if (!process.env.DATABASE_URL) {
            return res.json({
                success: true,
                usage: {
                    eventsThisMonth: 0,
                    eventsLimit: PRICING_TIERS.free.eventsLimit,
                    percentUsed: 0
                }
            });
        }

        // Get user's domains
        const domains = await query<{ id: string }>(
            'SELECT id FROM domains WHERE user_id = $1',
            [userId]
        );

        if (domains.length === 0) {
            return res.json({
                success: true,
                usage: {
                    eventsThisMonth: 0,
                    eventsLimit: PRICING_TIERS.free.eventsLimit,
                    percentUsed: 0
                }
            });
        }

        const domainIds = domains.map(d => d.id);

        // Get current month usage
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const usageResult = await queryOne<{ total: string }>(`
            SELECT COALESCE(SUM(events_count), 0) as total
            FROM usage_logs
            WHERE domain_id = ANY($1) AND month >= $2
        `, [domainIds, monthStart]);

        const eventsUsed = parseInt(usageResult?.total || '0');
        const subscription = await queryOne<{ events_limit: number }>(
            'SELECT events_limit FROM subscriptions WHERE user_id = $1',
            [userId]
        );

        const eventsLimit = subscription?.events_limit || PRICING_TIERS.free.eventsLimit;
        const percentUsed = eventsLimit > 0 ? Math.round((eventsUsed / eventsLimit) * 100) : 0;

        res.json({
            success: true,
            usage: {
                eventsThisMonth: eventsUsed,
                eventsLimit,
                percentUsed
            }
        });
    } catch (error) {
        console.error('Error getting usage:', error);
        res.status(500).json({ error: 'Failed to get usage' });
    }
});

export default router;
