'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { payments } from '@/lib/api';
import { meterTone, percent, timeUntil, TONE_COLORS, type UsageMeter } from '@/lib/usage';

const REFRESH_MS = 5 * 60_000;

/**
 * Sidebar summary: the plan in force and how much of the event allowance is
 * left, so owners see it running down before collection stops.
 */
export function UsageWidget() {
    const [planName, setPlanName] = useState<string | null>(null);
    const [events, setEvents] = useState<UsageMeter | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = () => {
            payments.getCurrent().then(({ data }) => {
                if (!cancelled && data?.subscription) {
                    setPlanName(data.subscription.planName || data.subscription.plan);
                }
            });
            payments.getUsage().then(({ data }) => {
                const meter = data?.usage?.meters?.find(m => m.key === 'events');
                if (!cancelled && meter) setEvents(meter);
            });
        };
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => { cancelled = true; clearInterval(timer); };
    }, []);

    if (!events) return null;
    const tone = meterTone(events.used, events.limit);

    return (
        <Link
            href="/dashboard/settings?tab=subscription"
            title="Usage and plan"
            style={{
                display: 'block', margin: '0 12px 8px', padding: '8px 10px',
                border: '1px solid var(--color-border)', borderRadius: '6px',
                textDecoration: 'none', color: 'var(--color-text-secondary)', fontSize: '0.75rem',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{planName ?? ''} plan</span>
                <span style={{ color: TONE_COLORS[tone] }}>{percent(events.used, events.limit)}%</span>
            </div>
            <div style={{ height: '4px', background: 'var(--color-bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${percent(events.used, events.limit)}%`, height: '100%', background: TONE_COLORS[tone] }} />
            </div>
            <div style={{ marginTop: '6px', color: 'var(--color-text-muted)' }}>
                {events.used.toLocaleString()} of {events.limit?.toLocaleString()} events
                {events.resetsAt && <> · resets {timeUntil(events.resetsAt)}</>}
            </div>
        </Link>
    );
}
