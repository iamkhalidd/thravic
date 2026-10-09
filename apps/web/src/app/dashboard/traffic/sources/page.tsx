'use client';

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
    Activity,
    ExternalLink,
    Mail,
    MousePointer2,
    Search,
    Smartphone,
    Target,
    Trophy,
    Globe,
} from 'lucide-react';
import { sources } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { useApiRange } from '@/contexts/DateRangeContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { ChartCard } from '@/components/ChartCard';
import { BarList } from '@/components/charts/BarList';
import type { BarListItem } from '@/components/charts/BarList';

type ChannelKey = 'direct' | 'organic' | 'paid' | 'social' | 'referral' | 'email';

const CHANNELS: Array<{ key: ChannelKey; label: string; icon: ReactNode }> = [
    { key: 'direct', label: 'Direct', icon: <MousePointer2 size={14} /> },
    { key: 'organic', label: 'Organic search', icon: <Search size={14} /> },
    { key: 'paid', label: 'Paid', icon: <Target size={14} /> },
    { key: 'social', label: 'Social', icon: <Smartphone size={14} /> },
    { key: 'referral', label: 'Referral', icon: <ExternalLink size={14} /> },
    { key: 'email', label: 'Email', icon: <Mail size={14} /> },
];

interface SourcesData {
    totalSessions: number;
    channels: BarListItem[];
    referrers: BarListItem[];
    social: BarListItem[];
    search: BarListItem[];
}

export default function TrafficSourcesPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const range = useApiRange();
    const [data, setData] = useState<SourcesData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainLoading) setLoading(false);
            return;
        }
        let cancelled = false;

        const loadData = async () => {
            if (!range.background) setLoading(true);
            setError(null);
            const { start, end } = range;
            const [overviewRes, referrersRes, socialRes, searchRes] = await Promise.all([
                sources.getOverview(selectedDomainId, start, end),
                sources.getReferrers(selectedDomainId, start, end),
                sources.getSocial(selectedDomainId, start, end),
                sources.getSearch(selectedDomainId, start, end),
            ]);
            if (cancelled) return;

            if (!overviewRes.data) {
                setError(overviewRes.error || 'Could not load traffic sources.');
                setData(null);
                setLoading(false);
                return;
            }

            const byType = overviewRes.data.summary?.byType;
            setData({
                totalSessions: overviewRes.data.summary?.totalSessions ?? 0,
                channels: CHANNELS.map(c => ({ label: c.label, value: byType?.[c.key]?.count ?? 0, icon: c.icon })),
                // The referrers endpoint has the full list; the overview's top list is the fallback.
                referrers: (referrersRes.data?.referrers ?? overviewRes.data.topReferrers ?? [])
                    .map(r => ({ label: r.site, value: r.sessions ?? 0, icon: <Globe size={14} /> })),
                social: (socialRes.data?.platforms ?? overviewRes.data.topSocial ?? [])
                    .map(p => ({ label: p.platform, value: p.sessions ?? 0 })),
                search: (searchRes.data?.engines ?? []).map(e => ({ label: e.engine, value: e.sessions ?? 0 })),
            });
            setLoading(false);
        };

        loadData();
        return () => { cancelled = true; };
    }, [selectedDomainId, range, domainLoading]);

    const header = <PageHeader title="Sources" subtitle="Where your visitors come from." />;

    if (loading || domainLoading) {
        return (
            <div className="page-stack">
                {header}
                <div className="stat-grid">
                    {[1, 2, 3, 4].map(i => <StatCard key={i} label="" value="" loading />)}
                </div>
                <div className="dash-grid-2">
                    {[1, 2, 3, 4].map(i => <ChartCard key={i} title="" loading><span /></ChartCard>)}
                </div>
            </div>
        );
    }

    if (!selectedDomainId) {
        return (
            <div className="page-stack">
                {header}
                <div className="card"><p className="empty-note">Select a website to see its traffic sources.</p></div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="page-stack">
                {header}
                <div className="card" role="alert">
                    <p className="empty-note" style={{ color: 'var(--color-error)' }}>{error || 'Could not load traffic sources.'}</p>
                </div>
            </div>
        );
    }

    const topChannel = [...data.channels].sort((a, b) => b.value - a.value)[0];
    const share = (n: number) => (data.totalSessions > 0 ? `${Math.round((n / data.totalSessions) * 100)}% of sessions` : undefined);

    return (
        <div className="page-stack">
            {header}

            <div className="stat-grid">
                <StatCard label="Sessions" icon={Activity} value={data.totalSessions.toLocaleString()} hint="All channels" />
                <StatCard
                    label="Top channel"
                    icon={Trophy}
                    value={topChannel && topChannel.value > 0 ? topChannel.label : '—'}
                    hint={topChannel && topChannel.value > 0 ? share(topChannel.value) : 'No sessions yet'}
                />
                <StatCard
                    label="Direct sessions"
                    icon={MousePointer2}
                    value={(data.channels.find(c => c.label === 'Direct')?.value ?? 0).toLocaleString()}
                    hint="Typed in or bookmarked"
                />
                <StatCard
                    label="Referring sites"
                    icon={Globe}
                    value={data.referrers.length.toLocaleString()}
                    hint={data.referrers.length ? 'Search and social are counted in their own channels' : 'None in this period'}
                />
            </div>

            <div className="dash-grid-2">
                <ChartCard title="Channels" subtitle="Sessions by channel">
                    <BarList items={data.channels} labelHeader="Channel" valueHeader="Sessions" emptyText="No sessions in this period." />
                </ChartCard>
                <ChartCard title="Top referrers" subtitle="Other sites that linked visitors here">
                    <BarList
                        items={data.referrers}
                        labelHeader="Site"
                        valueHeader="Sessions"
                        emptyText="No referring sites in this period. Visits from links on other sites appear here."
                    />
                </ChartCard>
                <ChartCard title="Social networks" subtitle="Sessions from social platforms">
                    <BarList items={data.social} labelHeader="Network" valueHeader="Sessions" emptyText="No social traffic in this period." />
                </ChartCard>
                <ChartCard title="Search engines" subtitle="Organic search sessions by engine">
                    <BarList items={data.search} labelHeader="Engine" valueHeader="Sessions" emptyText="No organic search traffic in this period." />
                </ChartCard>
            </div>
        </div>
    );
}
