'use client';

import { useState, useEffect } from 'react';
import {
    Monitor,
    Smartphone,
    Tablet,
    Globe,
    Chrome
} from 'lucide-react';
import { analytics } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';

export default function DevicesPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'devices' | 'browsers' | 'os'>('devices');

    useEffect(() => {
        if (selectedDomainId) {
            loadData();
        }
    }, [selectedDomainId]);

    const loadData = async () => {
        if (!selectedDomainId) return;
        setLoading(true);
        const result = await analytics.getDashboard(selectedDomainId);
        if (result.data) {
            setData(result.data);
        }
        setLoading(false);
    };

    if (domainLoading || loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-xl)' }}>
                <div className="loading-spinner" />
            </div>
        );
    }

    if (!selectedDomainId) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
                <p>Please select a domain to view device analytics</p>
            </div>
        );
    }

    // Mock device data
    const devices = [
        { name: 'Desktop', icon: Monitor, sessions: 5420, percentage: 62 },
        { name: 'Mobile', icon: Smartphone, sessions: 2840, percentage: 32 },
        { name: 'Tablet', icon: Tablet, sessions: 520, percentage: 6 }
    ];

    const browsers = [
        { name: 'Chrome', sessions: 4500, percentage: 51 },
        { name: 'Safari', sessions: 2200, percentage: 25 },
        { name: 'Firefox', sessions: 1100, percentage: 13 },
        { name: 'Edge', sessions: 700, percentage: 8 },
        { name: 'Other', sessions: 280, percentage: 3 }
    ];

    const operatingSystems = [
        { name: 'Windows', sessions: 3800, percentage: 43 },
        { name: 'macOS', sessions: 2100, percentage: 24 },
        { name: 'iOS', sessions: 1600, percentage: 18 },
        { name: 'Android', sessions: 1000, percentage: 11 },
        { name: 'Linux', sessions: 280, percentage: 4 }
    ];

    return (
        <div>
            {/* Page Header */}
            <div style={{ marginBottom: 'var(--space-xl)' }}>
                <h1 style={{
                    fontSize: '1.5rem',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: 'var(--space-xs)'
                }}>
                    Devices
                </h1>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Analyze your audience by device, browser, and operating system
                </p>
            </div>

            {/* Tab Selector */}
            <div style={{
                display: 'flex',
                gap: 'var(--space-xs)',
                marginBottom: 'var(--space-lg)'
            }}>
                {(['devices', 'browsers', 'os'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{
                            padding: 'var(--space-xs) var(--space-md)',
                            background: tab === t ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
                            color: tab === t ? 'white' : 'var(--color-text-secondary)',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            textTransform: 'capitalize'
                        }}
                    >
                        {t === 'os' ? 'Operating Systems' : t}
                    </button>
                ))}
            </div>

            {/* Device Cards */}
            {tab === 'devices' && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 'var(--space-lg)',
                    marginBottom: 'var(--space-xl)'
                }}>
                    {devices.map((device, idx) => {
                        const Icon = device.icon;
                        return (
                            <div
                                key={idx}
                                style={{
                                    padding: 'var(--space-xl)',
                                    background: 'var(--color-bg-secondary)',
                                    borderRadius: 'var(--radius-lg)',
                                    border: '1px solid var(--color-border)',
                                    textAlign: 'center'
                                }}
                            >
                                <div style={{
                                    width: '60px',
                                    height: '60px',
                                    borderRadius: '50%',
                                    background: 'var(--color-primary-alpha)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto var(--space-md)'
                                }}>
                                    <Icon size={28} style={{ color: 'var(--color-primary)' }} />
                                </div>
                                <div style={{
                                    fontSize: '0.875rem',
                                    color: 'var(--color-text-secondary)',
                                    marginBottom: 'var(--space-xs)'
                                }}>
                                    {device.name}
                                </div>
                                <div style={{
                                    fontSize: '1.75rem',
                                    fontWeight: 600,
                                    color: 'var(--color-text-primary)',
                                    marginBottom: 'var(--space-xs)'
                                }}>
                                    {device.sessions.toLocaleString()}
                                </div>
                                <div style={{
                                    fontSize: '0.8125rem',
                                    color: 'var(--color-primary)',
                                    fontWeight: 500
                                }}>
                                    {device.percentage}%
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Browser/OS List */}
            {(tab === 'browsers' || tab === 'os') && (
                <div style={{
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border)',
                    padding: 'var(--space-lg)'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                        {(tab === 'browsers' ? browsers : operatingSystems).map((item, idx) => (
                            <div key={idx}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 'var(--space-xs)'
                                }}>
                                    <span style={{
                                        fontSize: '0.875rem',
                                        color: 'var(--color-text-primary)',
                                        fontWeight: 500
                                    }}>
                                        {item.name}
                                    </span>
                                    <span style={{
                                        fontSize: '0.8125rem',
                                        color: 'var(--color-text-secondary)'
                                    }}>
                                        {item.sessions.toLocaleString()} ({item.percentage}%)
                                    </span>
                                </div>
                                <div style={{
                                    height: '8px',
                                    background: 'var(--color-bg-tertiary)',
                                    borderRadius: '4px',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${item.percentage}%`,
                                        background: 'var(--gradient-primary)',
                                        borderRadius: '4px',
                                        transition: 'width 0.3s ease'
                                    }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
