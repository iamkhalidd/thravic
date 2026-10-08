'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useDomain } from '@/contexts/DomainContext';
import { useSubscription, type PlanFeature } from '@/hooks/useSubscription';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';
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
        <div className="page-stack">
            <PageHeader
                title="Tracking"
                subtitle={<>Choose what is collected from <strong style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{selectedDomain?.domain || 'your site'}</strong>.</>}
            />

            {selectedDomain?.paused && (
                <div role="status" className="card" style={{ borderColor: 'var(--color-warning)', padding: '14px 20px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 4, color: 'var(--color-warning)' }}>This site is paused</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                        The account&apos;s plan covers fewer websites than it has, so this one isn&apos;t
                        collecting new data. Everything already collected is kept.
                        {selectedDomain.isOwner
                            ? ' Renew to resume every site, or choose this one to keep collecting instead.'
                            : ' The site owner can renew or choose which sites keep collecting.'}
                    </div>
                    {selectedDomain.isOwner && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-primary" onClick={keepActive} disabled={keeping}>
                                {keeping ? 'Switching…' : 'Keep collecting on this site'}
                            </button>
                            <Link href="/dashboard/settings" className="btn btn-secondary">Renew plan</Link>
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div role="alert" className="card" style={{ borderColor: 'var(--color-error)', padding: '12px 16px' }}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-error)', margin: 0 }}>{error}</p>
                </div>
            )}

            <ChartCard
                flush
                title="Collected data"
                subtitle="Page views are always collected. Changes reach visitors' browsers within about a minute."
            >
                <div style={{ marginTop: 10, borderTop: '1px solid var(--color-border)' }}>
                    {!settings ? (
                        <div className="skeleton" style={{ height: 150, margin: 20 }} />
                    ) : SWITCHES.map(item => {
                        const locked = !!item.feature && !hasFeature(item.feature, selectedDomain?.features || undefined);
                        const on = settings[item.key];
                        const id = `setting-${item.key}`;
                        return (
                            <div key={item.key} style={rowStyle}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <label htmlFor={id} style={{ fontWeight: 500, fontSize: '0.875rem', cursor: locked ? 'default' : 'pointer' }}>
                                        {item.label}
                                    </label>
                                    <div style={descriptionStyle}>
                                        {item.description}
                                        {locked && (
                                            <> Requires the Pro plan. <Link href="/dashboard/settings" style={{ color: 'var(--color-text-primary)', textDecoration: 'underline' }}>Upgrade</Link></>
                                        )}
                                    </div>
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', minWidth: 22, textAlign: 'right' }} aria-hidden="true">
                                    {on && !locked ? 'On' : 'Off'}
                                </span>
                                <button
                                    id={id}
                                    type="button"
                                    role="switch"
                                    aria-checked={on}
                                    disabled={locked || saving !== null}
                                    onClick={() => toggle(item.key)}
                                    style={{
                                        width: '40px', height: '22px', flexShrink: 0,
                                        borderRadius: '11px', border: '1px solid var(--color-border)',
                                        background: on && !locked ? 'var(--color-text-primary)' : 'var(--color-bg-tertiary)',
                                        position: 'relative', cursor: locked ? 'not-allowed' : 'pointer',
                                        opacity: locked ? 0.5 : 1, transition: 'background 150ms ease',
                                    }}
                                >
                                    <span style={{
                                        position: 'absolute', top: '2px', left: on && !locked ? '20px' : '2px',
                                        width: '16px', height: '16px', borderRadius: '50%',
                                        background: on && !locked ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
                                        transition: 'left 150ms ease',
                                    }} />
                                </button>
                            </div>
                        );
                    })}
                    <div style={{ ...rowStyle, borderBottom: 'none' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 500, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                                Session recording
                                {settings && (
                                    <span className={settings.sessionRecording ? 'badge badge-success' : 'badge'}>
                                        {settings.sessionRecording ? 'On' : 'Off'}
                                    </span>
                                )}
                            </div>
                            <div style={descriptionStyle}>
                                Replays of visits, with visitor consent, a share of visits and a daily limit. Typed values are never recorded.
                            </div>
                        </div>
                        <Link href="/dashboard/sessions" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8125rem' }}>Manage on Sessions</Link>
                    </div>
                </div>
            </ChartCard>

            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                Anything switched off stops being stored straight away.
                If your site sets these options in <code>window.__TF_CONFIG__</code>, the browser follows that instead, but nothing switched off here is stored either way.
            </p>
        </div>
    );
}

const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 20px',
    borderBottom: '1px solid var(--color-border)',
};

const descriptionStyle: React.CSSProperties = {
    fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 2,
};
