'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Megaphone,
    TrendingUp,
    TrendingDown,
    Filter,
    Search,
    ExternalLink,
    Eye,
    Users,
    FileText
} from 'lucide-react';
import { sources } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';

export default function CampaignsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('sessions');

    useEffect(() => {
        const loadCampaigns = async () => {
            if (!selectedDomainId) return;
            setLoading(true);
            const result = await sources.getCampaigns(selectedDomainId);
            if (result.data) {
                setCampaigns(result.data.campaigns || []);
            }
            setLoading(false);
        };

        if (selectedDomainId) {
            loadCampaigns();
        }
    }, [selectedDomainId]);

    const filteredCampaigns = campaigns
        .filter(c => c.campaign?.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => b[sortBy] - a[sortBy]);

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
                <p>Please select a domain to view campaigns</p>
            </div>
        );
    }

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
                    Campaigns
                </h1>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Track UTM campaign performance
                </p>
            </div>

            {/* Controls */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-lg)'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-xs)',
                    padding: 'var(--space-xs) var(--space-sm)',
                    background: 'var(--color-bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)'
                }}>
                    <Search size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                    <input
                        type="text"
                        placeholder="Search campaigns..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            fontSize: '0.8125rem',
                            color: 'var(--color-text-primary)',
                            width: '200px'
                        }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Sort by:</span>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        style={{
                            padding: 'var(--space-xs) var(--space-sm)',
                            background: 'var(--color-bg-tertiary)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '0.8125rem',
                            color: 'var(--color-text-primary)',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="sessions">Sessions</option>
                        <option value="visitors">Visitors</option>
                        <option value="pageviews">Pageviews</option>
                    </select>
                </div>
            </div>

            {/* Campaign Cards */}
            <div style={{
                display: 'grid',
                gap: 'var(--space-md)'
            }}>
                {filteredCampaigns.length === 0 ? (
                    <div style={{
                        padding: 'var(--space-xl)',
                        textAlign: 'center',
                        color: 'var(--color-text-secondary)',
                        background: 'var(--color-bg-card)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--color-border)'
                    }}>
                        <Megaphone size={40} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
                        <p>No campaigns found</p>
                        <p style={{ fontSize: '0.8125rem', marginTop: 'var(--space-xs)' }}>
                            Campaigns are tracked via UTM parameters in your URLs
                        </p>
                    </div>
                ) : (
                    filteredCampaigns.map((campaign, idx) => (
                        <div
                            key={idx}
                            style={{
                                padding: 'var(--space-lg)',
                                background: 'var(--color-bg-card)',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--color-border)'
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                marginBottom: 'var(--space-md)'
                            }}>
                                <div>
                                    <h3 style={{
                                        fontSize: '1rem',
                                        fontWeight: 500,
                                        color: 'var(--color-text-primary)',
                                        marginBottom: 'var(--space-xs)'
                                    }}>
                                        {campaign.campaign || 'Unnamed Campaign'}
                                    </h3>
                                    <div style={{
                                        display: 'flex',
                                        gap: 'var(--space-md)',
                                        fontSize: '0.75rem',
                                        color: 'var(--color-text-tertiary)'
                                    }}>
                                        <span>Source: {campaign.source || 'N/A'}</span>
                                        <span>Medium: {campaign.medium || 'N/A'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="dash-grid-4">
                                <div>
                                    <div style={{
                                        fontSize: '0.6875rem',
                                        color: 'var(--color-text-tertiary)',
                                        marginBottom: '2px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        <Eye size={10} /> Sessions
                                    </div>
                                    <div style={{
                                        fontSize: '1.125rem',
                                        fontWeight: 600,
                                        color: 'var(--color-text-primary)'
                                    }}>
                                        {(campaign.sessions || 0).toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <div style={{
                                        fontSize: '0.6875rem',
                                        color: 'var(--color-text-tertiary)',
                                        marginBottom: '2px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        <Users size={10} /> Visitors
                                    </div>
                                    <div style={{
                                        fontSize: '1.125rem',
                                        fontWeight: 600,
                                        color: 'var(--color-text-primary)'
                                    }}>
                                        {(campaign.visitors || 0).toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <div style={{
                                        fontSize: '0.6875rem',
                                        color: 'var(--color-text-tertiary)',
                                        marginBottom: '2px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        <FileText size={10} /> Pageviews
                                    </div>
                                    <div style={{
                                        fontSize: '1.125rem',
                                        fontWeight: 600,
                                        color: 'var(--color-text-primary)'
                                    }}>
                                        {(campaign.pageviews || 0).toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <div style={{
                                        fontSize: '0.6875rem',
                                        color: 'var(--color-text-tertiary)',
                                        marginBottom: '2px'
                                    }}>
                                        Pages / Session
                                    </div>
                                    <div style={{
                                        fontSize: '1.125rem',
                                        fontWeight: 600,
                                        color: 'var(--color-text-primary)'
                                    }}>
                                        {(campaign.pagesPerSession || 0).toFixed(1)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
