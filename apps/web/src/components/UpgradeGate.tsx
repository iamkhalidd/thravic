'use client';

import React from 'react';
import Link from 'next/link';
import { PlanFeature, PlanName } from '../hooks/useSubscription';

interface UpgradeGateProps {
    feature: PlanFeature;
    /** Which plan unlocks this feature (shown in the CTA) */
    requiredPlan: PlanName;
    /** Custom message to show instead of the default */
    message?: string;
    /** Render children even when locked (blur-overlay mode) */
    blurChildren?: boolean;
    children?: React.ReactNode;
}

const PLAN_LABELS: Record<PlanName, string> = {
    free: 'Hobby',
    pro: 'Pro',
    agency: 'Agency',
};

/**
 * Wraps any component with a plan-gate overlay.
 *
 * @example
 * <UpgradeGate feature="funnels" requiredPlan="pro">
 *   <FunnelBuilder />
 * </UpgradeGate>
 */
export function UpgradeGate({ feature, requiredPlan, message, blurChildren, children }: UpgradeGateProps) {
    const planLabel = PLAN_LABELS[requiredPlan];

    return (
        <div style={{ position: 'relative' }}>
            {/* Optionally render a blurred preview of the locked content */}
            {blurChildren && children && (
                <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none', opacity: 0.4 }}>
                    {children}
                </div>
            )}

            {/* Overlay */}
            <div
                style={{
                    position: blurChildren ? 'absolute' : 'relative',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    padding: '2rem',
                    textAlign: 'center',
                    background: blurChildren
                        ? 'rgba(0,0,0,0.55)'
                        : 'var(--surface, #1a1a2e)',
                    borderRadius: '0.75rem',
                    border: '1px solid var(--border, #2a2a3e)',
                }}
            >
                <span style={{ fontSize: '2rem' }}>🔒</span>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary, #fff)', fontSize: '1rem' }}>
                    {message ?? `This feature requires the ${planLabel} plan`}
                </p>
                <p style={{ margin: 0, color: 'var(--text-muted, #aaa)', fontSize: '0.85rem' }}>
                    Upgrade to unlock <strong>{feature}</strong> and more.
                </p>
                <Link
                    href="/dashboard/settings/billing"
                    style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem 1.25rem',
                        borderRadius: '0.5rem',
                        background: 'var(--accent, #F29F67)',
                        color: '#fff',
                        fontWeight: 600,
                        textDecoration: 'none',
                        fontSize: '0.875rem',
                    }}
                >
                    Upgrade to {planLabel}
                </Link>
            </div>
        </div>
    );
}
