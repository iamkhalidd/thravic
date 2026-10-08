'use client';

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { sources } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { useApiRange } from '@/contexts/DateRangeContext';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';

interface Campaign {
    campaign: string;
    source: string;
    medium: string;
    visitors: number;
    sessions: number;
    pageviews: number;
    pagesPerSession: number;
}

type SortKey = 'sessions' | 'visitors' | 'pageviews' | 'pagesPerSession';

const SORT_OPTIONS: Array<[SortKey, string]> = [
    ['sessions', 'Sessions'], ['visitors', 'Visitors'], ['pageviews', 'Pageviews'], ['pagesPerSession', 'Pages / session'],
];

export default function CampaignsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const range = useApiRange();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<SortKey>('sessions');

    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainLoading) setLoading(false);
            return;
        }
        let cancelled = false;

        const loadCampaigns = async () => {
            setLoading(true);
            setError(null);
            const result = await sources.getCampaigns(selectedDomainId, range.start, range.end);
            if (cancelled) return;
            if (result.data) {
                setCampaigns(result.data.campaigns || []);
            } else {
                setCampaigns([]);
                setError(result.error || 'Could not load campaigns.');
            }
            setLoading(false);
        };

        loadCampaigns();
        return () => { cancelled = true; };
    }, [selectedDomainId, range, domainLoading]);

    const query = searchQuery.trim().toLowerCase();
    const filteredCampaigns = campaigns
        .filter(c => !query || (c.campaign || '').toLowerCase().includes(query))
        .sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));

    const controls = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ position: 'relative', display: 'flex', alignItems: 'center', maxWidth: '100%' }}>
                <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, color: 'var(--color-text-muted)' }} />
                <input
                    type="search"
                    className="input"
                    placeholder="Search campaigns"
                    aria-label="Search campaigns"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ width: 200, maxWidth: '100%', padding: '6px 10px 6px 30px', fontSize: '0.8125rem' }}
                />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                Sort by
                <select
                    className="input"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortKey)}
                    style={{ width: 'auto', padding: '6px 10px', fontSize: '0.8125rem', cursor: 'pointer' }}
                >
                    {SORT_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
            </label>
        </div>
    );

    const header = <PageHeader title="Campaigns" subtitle="Performance of links tagged with UTM parameters." actions={controls} />;

    if (!domainLoading && !loading && !selectedDomainId) {
        return (
            <div className="page-stack">
                <PageHeader title="Campaigns" subtitle="Performance of links tagged with UTM parameters." />
                <div className="card"><p className="empty-note">Select a website to see its campaigns.</p></div>
            </div>
        );
    }

    let body;
    if (error) {
        body = <p className="empty-note" role="alert" style={{ color: 'var(--color-error)' }}>{error}</p>;
    } else if (campaigns.length === 0) {
        body = (
            <p className="empty-note">
                No campaigns in this period. Add UTM parameters to your links, e.g. <code>?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=launch</code>.
            </p>
        );
    } else if (filteredCampaigns.length === 0) {
        body = <p className="empty-note">No campaigns match &ldquo;{searchQuery}&rdquo;.</p>;
    } else {
        body = (
            <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th style={{ paddingLeft: 20 }}>Campaign</th>
                            <th>Source / medium</th>
                            <th className="num">Sessions</th>
                            <th className="num">Visitors</th>
                            <th className="num">Pageviews</th>
                            <th className="num" style={{ paddingRight: 20 }}>Pages / session</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCampaigns.map((c, idx) => (
                            <tr key={`${c.campaign}|${c.source}|${c.medium}|${idx}`}>
                                <td style={{ paddingLeft: 20, fontWeight: 500 }}>{c.campaign || 'Unnamed campaign'}</td>
                                <td className="muted">{c.source || '(none)'} / {c.medium || '(none)'}</td>
                                <td className="num">{(c.sessions || 0).toLocaleString()}</td>
                                <td className="num">{(c.visitors || 0).toLocaleString()}</td>
                                <td className="num">{(c.pageviews || 0).toLocaleString()}</td>
                                <td className="num" style={{ paddingRight: 20 }}>{(c.pagesPerSession || 0).toFixed(1)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    return (
        <div className="page-stack">
            {header}
            <ChartCard
                title="All campaigns"
                subtitle={loading || error ? undefined : `${campaigns.length.toLocaleString()} ${campaigns.length === 1 ? 'campaign' : 'campaigns'}`}
                loading={loading || domainLoading}
                height={220}
                flush
            >
                {body}
            </ChartCard>
        </div>
    );
}
