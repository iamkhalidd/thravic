// ──────────────────────────────────────────────
// TrackFlow — Plan & Feature Definitions
//
// Single source of truth for what each plan can access.
// Consumed by featureGate middleware and payments routes.
// ──────────────────────────────────────────────

export type PlanName = 'free' | 'growth' | 'pro' | 'enterprise';

export type PlanFeature =
    | 'analytics'       // Core dashboard (all plans)
    | 'realtime'        // Real-time visitors (all plans)
    | 'utm'             // UTM / traffic sources (all plans)
    | 'heatmaps'        // Click & scroll heatmaps (Growth+)
    | 'insights'        // Auto-generated smart insights (Growth+)
    | 'export'          // CSV data export (Growth+)
    | 'funnels'         // Conversion funnels (Pro+)
    | 'recordings'      // Session recordings (Pro+)
    | 'experiments'     // A/B experiments (Pro+)
    | 'webhooks'        // Webhook integrations (Pro+)
    | 'team';           // Team members / invite (Pro+)

/** Features available on each plan (cumulative) */
export const PLAN_FEATURES: Record<PlanName, PlanFeature[]> = {
    free: [
        'analytics',
        'realtime',
        'utm',
    ],
    growth: [
        'analytics',
        'realtime',
        'utm',
        'heatmaps',
        'insights',
        'export',
    ],
    pro: [
        'analytics',
        'realtime',
        'utm',
        'heatmaps',
        'insights',
        'export',
        'funnels',
        'recordings',
        'experiments',
        'webhooks',
        'team',
    ],
    enterprise: [
        'analytics',
        'realtime',
        'utm',
        'heatmaps',
        'insights',
        'export',
        'funnels',
        'recordings',
        'experiments',
        'webhooks',
        'team',
    ],
};

/** Maps a feature to the lowest plan that unlocks it */
const FEATURE_PLAN_MAP: Record<PlanFeature, PlanName> = {
    analytics:    'free',
    realtime:     'free',
    utm:          'free',
    heatmaps:     'growth',
    insights:     'growth',
    export:       'growth',
    funnels:      'pro',
    recordings:   'pro',
    experiments:  'pro',
    webhooks:     'pro',
    team:         'pro',
};

export function getPlanForFeature(feature: PlanFeature): PlanName {
    return FEATURE_PLAN_MAP[feature] ?? 'free';
}

/** Usage & pricing limits per plan */
export const PLAN_LIMITS = {
    free: {
        name: 'Free',
        eventsLimit: 10_000,
        domainsLimit: 1,
        retentionDays: 7,
        price: 0,
    },
    growth: {
        name: 'Growth',
        eventsLimit: 250_000,
        domainsLimit: 5,
        retentionDays: 90,
        price: 39,
    },
    pro: {
        name: 'Pro',
        eventsLimit: 2_000_000,
        domainsLimit: 20,
        retentionDays: 365,
        price: 99,
    },
    enterprise: {
        name: 'Enterprise',
        eventsLimit: -1,       // Unlimited
        domainsLimit: -1,
        retentionDays: 365,
        price: 299,
    },
} satisfies Record<PlanName, { name: string; eventsLimit: number; domainsLimit: number; retentionDays: number; price: number }>;

