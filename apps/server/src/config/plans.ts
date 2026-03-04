// ──────────────────────────────────────────────
// TrackFlow — Plan & Feature Definitions
//
// Single source of truth for what each plan can access.
// Consumed by featureGate middleware and payments routes.
// ──────────────────────────────────────────────

export type PlanName = 'free' | 'pro' | 'agency';

export type PlanFeature =
    | 'analytics'       // Core dashboard (all plans)
    | 'realtime'        // Real-time visitors (all plans)
    | 'utm'             // UTM / traffic sources (all plans)
    | 'heatmaps'        // Click & scroll heatmaps (Pro+)
    | 'insights'        // Auto-generated smart insights (Pro+)
    | 'export'          // CSV data export (Pro+)
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
    agency: [
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
    heatmaps:     'pro',
    insights:     'pro',
    export:       'pro',
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
        name: 'Hobby',
        eventsLimit: 5_000,
        domainsLimit: 1,
        retentionDays: 30,
        price: 0,
    },
    pro: {
        name: 'Pro',
        eventsLimit: 100_000,
        domainsLimit: 3,
        retentionDays: 365,
        price: 29,
    },
    agency: {
        name: 'Agency',
        eventsLimit: 500_000,
        domainsLimit: 20,
        retentionDays: 730,
        price: 79,
    },
} satisfies Record<PlanName, { name: string; eventsLimit: number; domainsLimit: number; retentionDays: number; price: number }>;

