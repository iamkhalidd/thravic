'use client';

import { useState, useEffect } from 'react';
import { MousePointerClick, Hash, Search, FileText } from 'lucide-react';
import { customEvents } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';

type RageClick = {
    tag: string | null;
    element_id: string | null;
    text: string | null;
    url: string;
    count: number;
    avg_click_count: number;
};

/** `button#checkout "Pay now"` — whichever parts the tracker captured. */
function describeElement(click: RageClick): string {
    const selector = `${(click.tag || 'element').toLowerCase()}${click.element_id ? `#${click.element_id}` : ''}`;
    return click.text ? `${selector} "${click.text}"` : selector;
}

function pathOf(url: string): string {
    try {
        return new URL(url).pathname;
    } catch {
        return url;
    }
}

export default function RageClicksPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [data, setData] = useState<{ totalRageClicks: number; rageClicks: RageClick[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const load = async () => {
            if (!selectedDomainId) return;
            setLoading(true);
            const result = await customEvents.getRageClicks(selectedDomainId);
            if (result.data) setData(result.data);
            setLoading(false);
        };
        if (selectedDomainId) load();
    }, [selectedDomainId]);

    if (!selectedDomainId && !domainLoading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
                <p>Please select a domain to view rage clicks</p>
            </div>
        );
    }

    if (domainLoading || loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-xl)' }}>
                <div className="loading-spinner" />
            </div>
        );
    }

    const rageClicks = data?.rageClicks || [];
    const query = searchQuery.toLowerCase();
    const filtered = rageClicks.filter(click =>
        describeElement(click).toLowerCase().includes(query) ||
        click.url.toLowerCase().includes(query)
    );
    const affectedPages = new Set(rageClicks.map(click => pathOf(click.url))).size;

    const statCard = (icon: React.ReactNode, label: string, value: string) => (
        <div style={{
            background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)', padding: 'var(--space-lg)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-sm)' }}>
                {icon}
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {value}
            </div>
        </div>
    );

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: 'var(--space-xl)' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 'var(--space-xs)' }}>
                    Rage Clicks
                </h1>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Elements visitors clicked repeatedly in frustration over the last 30 days
                </p>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
                {statCard(<MousePointerClick size={16} style={{ color: '#ef4444' }} />, 'Total Rage Clicks', (data?.totalRageClicks || 0).toLocaleString())}
                {statCard(<Hash size={16} style={{ color: 'var(--color-accent-primary)' }} />, 'Elements', rageClicks.length.toLocaleString())}
                {statCard(<FileText size={16} style={{ color: 'var(--color-accent-primary)' }} />, 'Pages Affected', affectedPages.toLocaleString())}
            </div>

            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', padding: 'var(--space-xs) var(--space-sm)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: 'var(--space-lg)', maxWidth: '400px' }}>
                <Search size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                <input
                    type="text"
                    placeholder="Search elements or pages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.8125rem', color: 'var(--color-text-primary)', width: '100%' }}
                />
            </div>

            {/* Table */}
            <div className="dash-table-wrap" style={{ background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                    <thead>
                        <tr style={{ background: 'var(--color-bg-tertiary)' }}>
                            <th style={{ textAlign: 'left', padding: 'var(--space-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Element</th>
                            <th style={{ textAlign: 'left', padding: 'var(--space-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Page</th>
                            <th style={{ textAlign: 'right', padding: 'var(--space-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Rage Clicks</th>
                            <th style={{ textAlign: 'right', padding: 'var(--space-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Avg Clicks per Burst</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={4} style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                    {rageClicks.length === 0 ? 'No rage clicks detected in the last 30 days' : 'No rage clicks match your search'}
                                </td>
                            </tr>
                        ) : filtered.map((click, idx) => (
                            <tr key={idx} style={{ borderTop: '1px solid var(--color-border)' }}>
                                <td style={{ padding: 'var(--space-md)', color: 'var(--color-text-primary)' }}>
                                    <span style={{ display: 'inline-block', maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)' }}>
                                        {describeElement(click)}
                                    </span>
                                </td>
                                <td style={{ padding: 'var(--space-md)', color: 'var(--color-text-secondary)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={click.url}>
                                    {pathOf(click.url)}
                                </td>
                                <td style={{ textAlign: 'right', padding: 'var(--space-md)', fontWeight: 600, color: click.count > 10 ? '#ef4444' : 'var(--color-text-primary)' }}>
                                    {click.count.toLocaleString()}
                                </td>
                                <td style={{ textAlign: 'right', padding: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>
                                    {click.avg_click_count ?? '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
