import { formatPlanPrice, planPeriod, type Plan } from './api';

// Pricing cards on the landing page. Every card comes from the admin-managed
// plans (GET /api/payments/plans); there are no built-in prices to fall back
// on, so a stale number can never be shown.

export type Tier = {
    id: string;
    name: string;
    price: string;
    /** Plan price in its own currency, for the approximate USD line. */
    amount: number;
    currency: string;
    period?: string;
    description: string;
    features: string[];
    cta: string;
    highlighted: boolean;
    badge?: string;
};

export function toTiers(plans: Plan[] | undefined): Tier[] {
    return (plans ?? [])
        .filter(plan => plan.show_on_landing !== false)
        .map(plan => ({
            id: plan.id,
            name: plan.name,
            price: formatPlanPrice(plan.price, plan.currency),
            amount: plan.price,
            currency: plan.currency ?? 'NGN',
            period: planPeriod(plan),
            description: plan.tagline ?? '',
            features: plan.bullets ?? [],
            cta: plan.price <= 0 ? 'Get Started Free' : `Get ${plan.name}`,
            highlighted: !!plan.badge,
            badge: plan.badge || undefined,
        }));
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Server-side: the landing plans, refreshed every five minutes. Null if the API can't be reached. */
export async function fetchLandingTiers(): Promise<Tier[] | null> {
    try {
        const res = await fetch(`${API_URL}/api/payments/plans`, {
            next: { revalidate: 300 },
            signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { plans?: Plan[] };
        const tiers = toTiers(data.plans);
        return tiers.length ? tiers : null;
    } catch {
        return null;
    }
}
