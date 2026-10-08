'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useDomain } from '@/contexts/DomainContext';
import { useSubscription, type PlanFeature } from '@/hooks/useSubscription';
import { SlidersHorizontal } from 'lucide-react';
import { domains, type DomainSettings, type DomainSwitch } from '@/lib/api';

const SWITCHES: Array<{ key: DomainSwitch; label: string; description: string; feature?: PlanFeature }> = [
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
];

export default function TrackingPage() {
    const { selectedDomainId, selectedDomain, refresh } = useDomain();
    const { hasFeature } = useSubscription();

    const [settings, setSettings] = useState<DomainSettings | null>(null);
    const [saving, setSaving] = useState<DomainSwitch | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [keeping, setKeeping] = useState(false);

    useEffect(() => {
        if (!selectedDomainId) return;
        setSettings(null);
        setError(null);
        domains.get(selectedDomainId).then(({ data, error }) => {
            if (data) setSettings(data.settings);
            if (error) setError(error);
        });
    }, [selectedDomainId]);

    const toggle = async (key: DomainSwitch) => {
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

    const keepActive = async () => {
        if (!selectedDomainId) return;
        setKeeping(true);
        setError(null);
        const { error } = await domains.keepActive(selectedDomainId);
        if (error) setError(error);
        else await refresh();
        setKeeping(false);
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

            {selectedDomain?.paused && (
                <div role="status" className="card" style={{
                    marginBottom: 'var(--space-md)', padding: 'var(--space-md) var(--space-lg)',
                    borderLeft: '3px solid var(--color-warning, #f5a623)',
                }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>This site is paused</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        The account&apos;s plan covers fewer websites than it has, so this one isn&apos;t
                        collecting new data. Everything already collected is kept.
                        {selectedDomain.isOwner
                            ? ' Renew to resume every site, or choose this one to keep collecting instead.'
                            : ' The site owner can renew or choose which sites keep collecting.'}
                    </div>
                    {selectedDomain.isOwner && (
                        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)', flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-primary" onClick={keepActive} disabled={keeping}>
                                {keeping ? 'Switching…' : 'Keep collecting on this site'}
                            </button>
                            <Link href="/dashboard/settings" className="btn btn-secondary">Renew plan</Link>
                        </div>
                    )}
                </div>
            )}

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
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
                    padding: 'var(--space-md) var(--space-lg)',
                }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                            Session recording {settings && (settings.sessionRecording ? '· On' : '· Off')}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                            Replays of visits, with visitor consent, a share of visits and a daily limit. Typed values are never recorded.
                        </div>
                    </div>
                    <Link href="/dashboard/sessions" className="btn btn-secondary">Manage on Sessions</Link>
                </div>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 'var(--space-md)' }}>
                Changes reach visitors&apos; browsers within about a minute; anything switched off stops being stored straight away.
                If your site sets these options in <code>window.__TF_CONFIG__</code>, the browser follows that instead, but nothing switched off here is stored either way.
            </p>
        </div>
    );
}
