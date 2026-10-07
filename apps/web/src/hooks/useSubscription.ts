'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// Mirrors the PlanFeature type from config/plans.ts on the server
export type PlanFeature =
    | 'analytics'
    | 'realtime'
    | 'utm'
    | 'heatmaps'
    | 'insights'
    | 'export'
    | 'funnels'
    | 'recordings'
    | 'experiments'
    | 'webhooks'
    | 'team';

export type PlanName = 'free' | 'pro' | 'agency';

export interface Subscription {
    plan: PlanName;
    status: string;
    eventsUsed: number;
    eventsLimit: number;
    domainsLimit: number;
    currentPeriodEnd?: string;
    features: PlanFeature[];
}

import { payments } from '@/lib/api';

async function fetchSubscription(): Promise<Subscription | null> {
    try {
        const res = await payments.getCurrent();
        if (res?.data?.subscription) {
            return res.data.subscription as unknown as Subscription;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Hook to read the current user's subscription plan and feature list.
 *
 * @example
 * const { hasFeature, plan, loading } = useSubscription();
 * if (!hasFeature('funnels')) return <UpgradeGate feature="funnels" requiredPlan="pro" />;
 */
export function useSubscription() {
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetchSubscription()
            .then(sub => { if (!cancelled) setSubscription(sub); })
            .catch(() => { if (!cancelled) setSubscription(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    // Stable between renders: pages list it in effect dependencies, and a new
    // function each render re-ran those effects forever (the Team page refetched
    // members until the API rate-limited the whole dashboard).
    const hasFeature = useCallback((feature: PlanFeature, domainFeatures?: string[]): boolean => {
        if (domainFeatures && domainFeatures.length > 0) {
            return domainFeatures.includes(feature as string);
        }
        if (!subscription) return false;
        return subscription.features.includes(feature);
    }, [subscription]);

    return {
        subscription,
        plan: subscription?.plan ?? 'free' as PlanName,
        features: subscription?.features ?? [],
        hasFeature,
        loading,
    };
}
