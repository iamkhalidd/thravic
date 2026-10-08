'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { payments } from '@/lib/api';
import { billingBanner, type Banner } from '@/lib/usage';

const DISMISS_KEY = 'tf_billing_banner_dismissed';

function dismissedId(): string | null {
    try {
        return localStorage.getItem(DISMISS_KEY);
    } catch {
        return null;
    }
}

/** Tells the owner their paid plan is ending, in grace, or has lapsed. A
 * dismissal hides only that message; the next stage shows again. */
export function BillingBanner() {
    const [banner, setBanner] = useState<Banner | null>(null);

    useEffect(() => {
        let cancelled = false;
        payments.getCurrent().then(({ data }) => {
            const next = billingBanner(data?.subscription ?? null);
            if (!cancelled && next && next.id !== dismissedId()) setBanner(next);
        });
        return () => { cancelled = true; };
    }, []);

    if (!banner) return null;

    const dismiss = () => {
        try {
            localStorage.setItem(DISMISS_KEY, banner.id);
        } catch {
            // Storage unavailable: hide for this page view only.
        }
        setBanner(null);
    };

    const warning = banner.tone === 'warning';
    return (
        <div
            role="status"
            style={{
                display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
                padding: '10px 16px', fontSize: '0.8125rem',
                background: warning ? 'rgba(245,158,11,0.12)' : 'rgba(59,143,243,0.12)',
                borderBottom: `1px solid ${warning ? '#f59e0b' : '#3B8FF3'}`,
                color: 'var(--color-text-primary)',
            }}
        >
            <span style={{ flex: 1, minWidth: '200px' }}>{banner.message}</span>
            <Link href="/dashboard/settings?tab=subscription" className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '0.8125rem' }}>
                {banner.action}
            </Link>
            <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex' }}
            >
                <X size={16} />
            </button>
        </div>
    );
}
