'use client';

import { useState, useEffect } from 'react';
import { Monitor, Smartphone, Tablet, Laptop } from 'lucide-react';
import { analytics } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';

const DEVICE_ICONS: Record<string, React.ElementType> = {
    Desktop: Monitor,
    Mobile: Smartphone,
    Tablet: Tablet,
    Unknown: Laptop,
};

function BarRow({ name, sessions, percentage }: { name: string; sessions: number; percentage: number }) {
    return (
        <div>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-xs)'
            }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                    {name}
                </span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                    {sessions.toLocaleString()} ({percentage}%)
                </span>
            </div>
            <div style={{ height: '8px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                    height: '100%',
                    width: `${percentage}%`,
                    background: 'var(--gradient-primary)',
                    borderRadius: '4px',
                    transition: 'width 0.4s ease'
                }} />
            </div>
        </div>
    );
}

export default function DevicesPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [data, setData] = useState<{
        devices: Array<{ name: string; sessions: number; percentage: number }>;
        browsers: Array<{ name: string; sessions: number; percentage: number }>;
        operatingSystems: Array<{ name: string; sessions: number; percentage: number }>;
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'devices' | 'browsers' | 'os'>('devices');

    useEffect(() => {
        if (!selectedDomainId) { setLoading(false); return; }
        setLoading(true);
        analytics.getDevices(selectedDomainId).then(result => {
            if (result.data) setData(result.data);
            setLoading(false);
        });
    }, [selectedDomainId]);

    if (domainLoading || loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-xl)' }}>
                <div className="loading-spinner" />
            </div>
        );
    }

    if (!selectedDomainId) {
        return (
            <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
                <p>Please select a domain to view device analytics</p>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: 'var(--space-xl)' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: 'var(--space-xs)' }}>Devices</h1>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Analyze your audience by device, browser, and operating system
                </p>
            </div>

            {/* Tab Selector */}
            <div style={{ 
                display: 'inline-flex', 
                gap: '4px', 
                marginBottom: 'var(--space-lg)',
                background: 'var(--color-bg-secondary)',
                padding: '4px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)'
            }}>
                {(['devices', 'browsers', 'os'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{
                            padding: '6px 16px',
                            background: tab === t ? 'var(--color-bg-hover)' : 'transparent',
                            color: tab === t ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            border: tab === t ? '1px solid var(--color-border)' : '1px solid transparent',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: tab === t ? 500 : 400,
                        }}
                    >
                        {t === 'os' ? 'Operating Systems' : t === 'browsers' ? 'Browsers' : 'Devices'}
                    </button>
                ))}
            </div>

            {/* Device Cards */}
            {tab === 'devices' && (
                data && data.devices.filter(d => d.name.toLowerCase() !== 'unknown').length > 0 ? (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                        gap: 'var(--space-lg)',
                        marginBottom: 'var(--space-xl)'
                    }}>
                        {(data.devices).filter(d => d.name.toLowerCase() !== 'unknown').map((device, idx) => {
                            const Icon = DEVICE_ICONS[device.name] || Monitor;
                            return (
                                <div key={idx} style={{
                                    padding: 'var(--space-xl)',
                                    background: 'var(--color-bg-secondary)',
                                    borderRadius: 'var(--radius-lg)',
                                    border: '1px solid var(--color-border)',
                                    textAlign: 'center'
                                }}>
                                    <div style={{
                                        width: '56px', height: '56px', borderRadius: '50%',
                                        background: 'var(--color-primary-alpha)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        margin: '0 auto var(--space-md)'
                                    }}>
                                        <Icon size={26} style={{ color: 'var(--color-primary)' }} />
                                    </div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
                                        {device.name}
                                    </div>
                                    <div style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: 'var(--space-xs)' }}>
                                        {device.sessions.toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-primary)', fontWeight: 500 }}>
                                        {device.percentage}%
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <EmptyState label="No device data yet. Install the tracking script to start collecting data." />
                )
            )}

            {/* Browser / OS List */}
            {(tab === 'browsers' || tab === 'os') && (() => {
                const list = tab === 'browsers' ? data?.browsers : data?.operatingSystems;
                return list && list.length > 0 ? (
                    <div style={{
                        background: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--color-border)',
                        padding: 'var(--space-lg)',
                        display: 'flex', flexDirection: 'column', gap: 'var(--space-md)'
                    }}>
                        {list.map((item, idx) => (
                            <BarRow key={idx} name={item.name} sessions={item.sessions} percentage={item.percentage} />
                        ))}
                    </div>
                ) : (
                    <EmptyState label={`No ${tab === 'browsers' ? 'browser' : 'OS'} data yet.`} />
                );
            })()}
        </div>
    );
}

function EmptyState({ label }: { label: string }) {
    return (
        <div style={{
            padding: 'var(--space-xl)',
            textAlign: 'center',
            color: 'var(--color-text-secondary)',
            background: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)'
        }}>
            <Monitor size={40} style={{ marginBottom: 'var(--space-md)', opacity: 0.4 }} />
            <p>{label}</p>
        </div>
    );
}
