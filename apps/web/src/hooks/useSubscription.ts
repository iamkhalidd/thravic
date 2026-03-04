'use client';

import { useState, useEffect } from 'react';
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function fetchSubscription(): Promise<Subscription | null> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return null;

    const res = await fetch(`${API_BASE}/api/payments/current`, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;
    const json = await res.json();
    return json.subscription ?? null;
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

    const hasFeature = (feature: PlanFeature): boolean => {
        if (!subscription) return false;
        return subscription.features.includes(feature);
    };

    return {
        subscription,
        plan: subscription?.plan ?? 'free' as PlanName,
        features: subscription?.features ?? [],
        hasFeature,
        loading,
    };
}
