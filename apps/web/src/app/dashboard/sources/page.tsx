'use client';

import { useState, useEffect } from 'react';
import {
    Globe,
    Search,
    Smartphone,
    ExternalLink,
    Mail,
    Target,
    RefreshCw,
    MousePointer2
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { domains, sources } from '@/lib/api';

// Types
interface SourceOverview {
    summary: {
        totalSessions: number;
        byType: {
            direct: { count: number; percentage: number };
            organic: { count: number; percentage: number };
            social: { count: number; percentage: number };
            referral: { count: number; percentage: number };
            paid: { count: number; percentage: number };
            email: { count: number; percentage: number };
        };
    };
    topReferrers: Array<{ site: string; sessions: number }>;
    topSocial: Array<{ platform: string; sessions: number }>;
    topCampaigns: Array<{ campaign: string; events: number }>;
}

interface Referrer {
    site: string;
    visitors: number;
    sessions: number;
    pageviews: number;
    pagesPerSession: number;
}

interface SocialPlatform {
    platform: string;
    visitors: number;
    sessions: number;
    bounceRate: number;
    engagement: string;
}

interface SearchEngine {
    engine: string;
    visitors: number;
    sessions: number;
    share: number;
}

interface Campaign {
    campaign: string;
    source: string;
    medium: string;
    visitors: number;
    sessions: number;
    pageviews: number;
    pagesPerSession: number;
}

const COLORS = ['#F29F67', '#E0B50F', '#34B1AA', '#3B8FF3', '#10b981', '#ef4444'];

const sourceTypeIcons: Record<string, React.ElementType> = {
    direct: MousePointer2,
    organic: Search,
    social: Smartphone,
    referral: ExternalLink,
    paid: Target,
    email: Mail
};

export default function SourcesPage() {
    const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'referrers' | 'social' | 'search' | 'campaigns'>('overview');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Data states
    const [overview, setOverview] = useState<SourceOverview | null>(null);
    const [referrers, setReferrers] = useState<Referrer[]>([]);
    const [socialPlatforms, setSocialPlatforms] = useState<SocialPlatform[]>([]);
    const [searchEngines, setSearchEngines] = useState<SearchEngine[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);

    useEffect(() => {
        domains.list().then(result => {
            if (result.data && result.data.domains.length > 0) {
                setSelectedDomainId(result.data.domains[0].id);
            } else {
                setLoading(false);
            }
        });
    }, []);

    useEffect(() => {
        const loadData = async () => {
            if (!selectedDomainId) return;
            setLoading(true);

            try {
                const [overviewRes, referrersRes, socialRes, searchRes, campaignsRes] = await Promise.all([
                    sources.getOverview(selectedDomainId),
                    sources.getReferrers(selectedDomainId),
                    sources.getSocial(selectedDomainId),
                    sources.getSearch(selectedDomainId),
                    sources.getCampaigns(selectedDomainId)
                ]);

                if (overviewRes.data) setOverview(overviewRes.data);
                if (referrersRes.data) setReferrers(referrersRes.data.referrers);
                if (socialRes.data) setSocialPlatforms(socialRes.data.platforms);
                if (searchRes.data) setSearchEngines(searchRes.data.engines);
                if (campaignsRes.data) setCampaigns(campaignsRes.data.campaigns);
            } catch (error) {
                console.error('Failed to load sources data:', error);
            }

            setLoading(false);
        };

        if (selectedDomainId) {
            loadData();
        }
    }, [selectedDomainId]);

    const handleRefresh = async () => {
        if (!selectedDomainId) return;
        setRefreshing(true);

        try {
            const [overviewRes, referrersRes, socialRes, searchRes, campaignsRes] = await Promise.all([
                sources.getOverview(selectedDomainId),
                sources.getReferrers(selectedDomainId),
                sources.getSocial(selectedDomainId),
                sources.getSearch(selectedDomainId),
                sources.getCampaigns(selectedDomainId)
            ]);

            if (overviewRes.data) setOverview(overviewRes.data);
            if (referrersRes.data) setReferrers(referrersRes.data.referrers);
            if (socialRes.data) setSocialPlatforms(socialRes.data.platforms);
            if (searchRes.data) setSearchEngines(searchRes.data.engines);
            if (campaignsRes.data) setCampaigns(campaignsRes.data.campaigns);
        } catch (error) {
            console.error('Failed to refresh sources data:', error);
        }

        setRefreshing(false);
    };

    const tabs = [
        { id: 'overview', label: 'Overview', icon: Globe },
        { id: 'referrers', label: 'Referrers', icon: ExternalLink },
        { id: 'social', label: 'Social', icon: Smartphone },
        { id: 'search', label: 'Search', icon: Search },
        { id: 'campaigns', label: 'Campaigns', icon: Target }
    ];

    const pieData = overview ? [
        { name: 'Direct', value: overview.summary.byType.direct.count, color: COLORS[0] },
        { name: 'Organic', value: overview.summary.byType.organic.count, color: COLORS[1] },
        { name: 'Social', value: overview.summary.byType.social.count, color: COLORS[2] },
        { name: 'Referral', value: overview.summary.byType.referral.count, color: COLORS[3] },
        { name: 'Paid', value: overview.summary.byType.paid.count, color: COLORS[4] },
        { name: 'Email', value: overview.summary.byType.email.count, color: COLORS[5] }
    ].filter(d => d.value > 0) : [];

    if (loading) {
        return (
            <div>
                <div className="skeleton" style={{ height: '40px', width: '200px', marginBottom: 'var(--space-xl)' }} />
                <div className="grid grid-cols-3 gap-lg">
                    <div className="card"><div className="skeleton" style={{ height: '300px' }} /></div>
                    <div className="card" style={{ gridColumn: 'span 2' }}><div className="skeleton" style={{ height: '300px' }} /></div>
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-xl)' }}>
                <div className="flex items-center gap-md">
                    <h1>Traffic Sources</h1>
                    <span className="badge" style={{ background: 'var(--color-accent-gradient)' }}>
                        <Globe size={12} style={{ marginRight: '4px' }} />
                        {overview?.summary.totalSessions || 0} sessions
                    </span>
                </div>
                <button onClick={handleRefresh} className="btn btn-secondary" disabled={refreshing}>
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 'var(--space-xs)', marginBottom: 'var(--space-xl)', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-sm)' }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 'var(--space-xs)',
                            padding: 'var(--space-sm) var(--space-md)',
                            background: activeTab === tab.id ? 'var(--color-bg-hover)' : 'transparent',
                            border: 'none', borderRadius: 'var(--radius-md)',
                            color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            cursor: 'pointer', fontSize: '0.875rem', fontWeight: activeTab === tab.id ? 600 : 400
                        }}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && overview && (
                <div className="grid grid-cols-3 gap-lg">
                    <div className="card">
                        <h4 style={{ marginBottom: 'var(--space-md)' }}>Source Distribution</h4>
                        <div style={{ height: '250px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                                        {pieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', justifyContent: 'center' }}>
                            {pieData.map((entry, i) => (
                                <div key={i} className="flex items-center gap-xs" style={{ fontSize: '0.75rem' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: entry.color }} />
                                    {entry.name}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="card" style={{ gridColumn: 'span 2' }}>
                        <h4 style={{ marginBottom: 'var(--space-md)' }}>Source Types</h4>
                        <div className="grid grid-cols-3 gap-md">
                            {Object.entries(overview.summary.byType).map(([type, data]) => {
                                const Icon = sourceTypeIcons[type] || Globe;
                                return (
                                    <div key={type} style={{ padding: 'var(--space-md)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                                        <div className="flex items-center gap-sm" style={{ marginBottom: 'var(--space-sm)' }}>
                                            <Icon size={18} style={{ color: 'var(--color-accent-primary)' }} />
                                            <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{type}</span>
                                        </div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{data.count}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{data.percentage}% of traffic</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="card">
                        <h4 style={{ marginBottom: 'var(--space-md)' }}>Top Referrers</h4>
                        {overview.topReferrers.length === 0 ? <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>No referrer data yet</p> : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                                {overview.topReferrers.slice(0, 5).map((ref, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <span style={{ fontSize: '0.875rem' }}>{ref.site}</span>
                                        <span className="badge">{ref.sessions}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="card">
                        <h4 style={{ marginBottom: 'var(--space-md)' }}>Top Social</h4>
                        {overview.topSocial.length === 0 ? <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>No social data yet</p> : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                                {overview.topSocial.slice(0, 5).map((social, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <span style={{ fontSize: '0.875rem' }}>{social.platform}</span>
                                        <span className="badge">{social.sessions}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="card">
                        <h4 style={{ marginBottom: 'var(--space-md)' }}>Top Campaigns</h4>
                        {overview.topCampaigns.length === 0 ? <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>No campaign data yet</p> : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                                {overview.topCampaigns.slice(0, 5).map((campaign, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <span style={{ fontSize: '0.875rem' }}>{campaign.campaign}</span>
                                        <span className="badge">{campaign.events}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Referrers Tab */}
            {activeTab === 'referrers' && (
                <div className="card">
                    <h4 style={{ marginBottom: 'var(--space-lg)' }}><ExternalLink size={18} style={{ marginRight: 'var(--space-sm)', verticalAlign: 'middle' }} />Top Referring Websites</h4>
                    {referrers.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-muted)' }}>
                            <ExternalLink size={48} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
                            <p>No referrer data yet. Start driving traffic to your site!</p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <th style={{ textAlign: 'left', padding: 'var(--space-sm)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Website</th>
                                        <th style={{ textAlign: 'right', padding: 'var(--space-sm)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Visitors</th>
                                        <th style={{ textAlign: 'right', padding: 'var(--space-sm)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Sessions</th>
                                        <th style={{ textAlign: 'right', padding: 'var(--space-sm)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Pageviews</th>
                                        <th style={{ textAlign: 'right', padding: 'var(--space-sm)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Pages/Session</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {referrers.map((ref, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: 'var(--space-sm)', fontWeight: 500 }}>{ref.site}</td>
                                            <td style={{ padding: 'var(--space-sm)', textAlign: 'right' }}>{ref.visitors}</td>
                                            <td style={{ padding: 'var(--space-sm)', textAlign: 'right' }}>{ref.sessions}</td>
                                            <td style={{ padding: 'var(--space-sm)', textAlign: 'right' }}>{ref.pageviews}</td>
                                            <td style={{ padding: 'var(--space-sm)', textAlign: 'right' }}>{ref.pagesPerSession}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Social Tab */}
            {activeTab === 'social' && (
                <div className="card">
                    <h4 style={{ marginBottom: 'var(--space-lg)' }}><Smartphone size={18} style={{ marginRight: 'var(--space-sm)', verticalAlign: 'middle' }} />Social Media Platforms</h4>
                    {socialPlatforms.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-muted)' }}>
                            <Smartphone size={48} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
                            <p>No social traffic yet. Share your site on social media!</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-md">
                            {socialPlatforms.map((platform, i) => (
                                <div key={i} style={{ padding: 'var(--space-md)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                                    <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-sm)' }}>
                                        <span style={{ fontWeight: 600 }}>{platform.platform}</span>
                                        <span className="badge" style={{
                                            background: platform.engagement === 'High' ? 'rgba(16, 185, 129, 0.2)' : platform.engagement === 'Medium' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                            color: platform.engagement === 'High' ? 'var(--color-success)' : platform.engagement === 'Medium' ? 'var(--color-warning)' : 'var(--color-error)'
                                        }}>{platform.engagement} Engagement</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-sm" style={{ fontSize: '0.875rem' }}>
                                        <div><div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Visitors</div><div style={{ fontWeight: 600 }}>{platform.visitors}</div></div>
                                        <div><div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Sessions</div><div style={{ fontWeight: 600 }}>{platform.sessions}</div></div>
                                        <div><div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Bounce Rate</div><div style={{ fontWeight: 600 }}>{platform.bounceRate}%</div></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Search Tab */}
            {activeTab === 'search' && (
                <div className="card">
                    <h4 style={{ marginBottom: 'var(--space-lg)' }}><Search size={18} style={{ marginRight: 'var(--space-sm)', verticalAlign: 'middle' }} />Search Engine Traffic</h4>
                    {searchEngines.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-muted)' }}>
                            <Search size={48} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
                            <p>No organic search traffic yet. Improve your SEO!</p>
                        </div>
                    ) : (
                        <div style={{ height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={searchEngines} layout="vertical">
                                    <XAxis type="number" />
                                    <YAxis dataKey="engine" type="category" width={100} />
                                    <Tooltip />
                                    <Bar dataKey="visitors" fill="var(--color-accent-primary)" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            )}

            {/* Campaigns Tab */}
            {activeTab === 'campaigns' && (
                <div className="card">
                    <h4 style={{ marginBottom: 'var(--space-lg)' }}><Target size={18} style={{ marginRight: 'var(--space-sm)', verticalAlign: 'middle' }} />UTM Campaign Performance</h4>
                    {campaigns.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-muted)' }}>
                            <Target size={48} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
                            <p>No campaign data yet. Add UTM parameters to your links!</p>
                            <p style={{ fontSize: '0.875rem', marginTop: 'var(--space-sm)' }}>Example: yoursite.com?utm_source=twitter&utm_medium=social&utm_campaign=launch</p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <th style={{ textAlign: 'left', padding: 'var(--space-sm)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Campaign</th>
                                        <th style={{ textAlign: 'left', padding: 'var(--space-sm)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Source</th>
                                        <th style={{ textAlign: 'left', padding: 'var(--space-sm)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Medium</th>
                                        <th style={{ textAlign: 'right', padding: 'var(--space-sm)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Visitors</th>
                                        <th style={{ textAlign: 'right', padding: 'var(--space-sm)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Sessions</th>
                                        <th style={{ textAlign: 'right', padding: 'var(--space-sm)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Pageviews</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {campaigns.map((campaign, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: 'var(--space-sm)', fontWeight: 500 }}>{campaign.campaign}</td>
                                            <td style={{ padding: 'var(--space-sm)' }}>{campaign.source}</td>
                                            <td style={{ padding: 'var(--space-sm)' }}><span className="badge" style={{ textTransform: 'capitalize' }}>{campaign.medium}</span></td>
                                            <td style={{ padding: 'var(--space-sm)', textAlign: 'right' }}>{campaign.visitors}</td>
                                            <td style={{ padding: 'var(--space-sm)', textAlign: 'right' }}>{campaign.sessions}</td>
                                            <td style={{ padding: 'var(--space-sm)', textAlign: 'right' }}>{campaign.pageviews}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
