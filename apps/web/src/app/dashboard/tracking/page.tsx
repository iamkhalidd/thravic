'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useDomain } from '@/contexts/DomainContext';
import { useSubscription, type PlanFeature } from '@/hooks/useSubscription';
import { SlidersHorizontal } from 'lucide-react';
import { domains, type DomainSettings } from '@/lib/api';

const SWITCHES: Array<{ key: keyof DomainSettings; label: string; description: string; feature?: PlanFeature }> = [
    {
        key: 'trackClicks',
        label: 'Clicks',
        description: 'Every click, with the element and its position. Powers click heatmaps and rage-click detection.',
    },
    {
        key: 'trackScrolls',
        label: 'Scroll depth',
        description: 'How far down each page visitors get, in 25% steps. Powers the scroll heatmap.',
    },
    {
        key: 'trackForms',
        label: 'Form submissions',
        description: 'That a form was submitted, with its name and field count. Field values are never sent.',
    },
    {
        key: 'sessionRecording',
        label: 'Session recording',
        description: 'Mouse movement, clicks, scrolling and typing activity (not what is typed) for replay on the Sessions page.',
        feature: 'recordings',
    },
];

export default function TrackingPage() {
    const { selectedDomainId, selectedDomain } = useDomain();
    const { hasFeature } = useSubscription();

    const [settings, setSettings] = useState<DomainSettings | null>(null);
    const [saving, setSaving] = useState<keyof DomainSettings | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedDomainId) return;
        setSettings(null);
        setError(null);
        domains.get(selectedDomainId).then(({ data, error }) => {
            if (data) setSettings(data.settings);
            if (error) setError(error);
        });
    }, [selectedDomainId]);

    const toggle = async (key: keyof DomainSettings) => {
        if (!selectedDomainId || !settings) return;
        const previous = settings;
        setSettings({ ...settings, [key]: !settings[key] }); // optimistic
        setSaving(key);
        setError(null);
        const { data, error } = await domains.updateSettings(selectedDomainId, { [key]: !previous[key] });
        if (data) {
            setSettings(data.settings);
        } else {
            setSettings(previous);
            setError(error || 'Could not save the setting');
        }
        setSaving(null);
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <SlidersHorizontal size={24} /> Tracking
                    </h2>
                    <p className="page-subtitle">
                        Choose what is collected from <strong>{selectedDomain?.domain || 'your domain'}</strong>
                    </p>
                </div>
            </div>

            {error && (
                <div role="alert" style={{
                    marginBottom: 'var(--space-md)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.875rem',
                    background: 'rgba(255,85,85,0.1)', color: '#ff5555', borderLeft: '3px solid #ff5555',
                }}>
                    {error}
                </div>
            )}

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {!settings ? (
                    <div className="loading" style={{ padding: '3rem' }}><div className="spinner" /></div>
                ) : SWITCHES.map(item => {
                    const locked = !!item.feature && !hasFeature(item.feature, selectedDomain?.features || undefined);
                    const on = settings[item.key];
                    const id = `setting-${item.key}`;
                    return (
                        <div
                            key={item.key}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
                                padding: 'var(--space-md) var(--space-lg)',
                                borderBottom: '1px solid var(--color-border)',
                            }}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <label htmlFor={id} style={{ fontWeight: 600, fontSize: '0.95rem', cursor: locked ? 'default' : 'pointer' }}>
                                    {item.label}
                                </label>
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                    {item.description}
                                    {locked && (
                                        <> Requires the Pro plan. <Link href="/dashboard/settings" style={{ color: 'var(--color-text-primary)', textDecoration: 'underline' }}>Upgrade</Link></>
                                    )}
                                </div>
                            </div>
                            <button
                                id={id}
                                type="button"
                                role="switch"
                                aria-checked={on}
                                disabled={locked || saving !== null}
                                onClick={() => toggle(item.key)}
                                style={{
                                    width: '44px', height: '24px', flexShrink: 0,
                                    borderRadius: '12px', border: '1px solid var(--color-border)',
                                    background: on && !locked ? 'var(--color-text-primary)' : 'var(--color-bg-tertiary)',
                                    position: 'relative', cursor: locked ? 'not-allowed' : 'pointer',
                                    opacity: locked ? 0.5 : 1, transition: 'background 150ms ease',
                                }}
                            >
                                <span style={{
                                    position: 'absolute', top: '2px', left: on && !locked ? '22px' : '2px',
                                    width: '18px', height: '18px', borderRadius: '50%',
                                    background: on && !locked ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
                                    transition: 'left 150ms ease',
                                }} />
                            </button>
                        </div>
                    );
                })}
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 'var(--space-md)' }}>
                Changes reach visitors&apos; browsers within about a minute; anything switched off stops being stored straight away.
                If your site sets these options in <code>window.__TF_CONFIG__</code>, the browser follows that instead, but nothing switched off here is stored either way.
            </p>
        </div>
    );
}
