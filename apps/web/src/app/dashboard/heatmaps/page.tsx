'use client';

import { useState, useEffect } from 'react';
import {
    MousePointer2,
    ArrowDown,
    Monitor,
    Smartphone,
    Tablet,
    Loader2
} from 'lucide-react';
import { domains } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface PageWithHeatmap {
    path: string;
    clicks: number;
    scrolls: number;
    visitors: number;
}

interface HeatmapPoint {
    x: number;
    y: number;
    count: number;
}

interface HeatmapData {
    points: HeatmapPoint[];
    totalInteractions: number;
    uniqueVisitors: number;
}

async function getPages(domainId: string) {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_URL}/api/heatmaps/${domainId}/pages`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
}

async function getClickHeatmap(domainId: string, page: string, viewport: string) {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_URL}/api/heatmaps/${domainId}/click?page=${encodeURIComponent(page)}&viewport=${viewport}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
}

async function getScrollHeatmap(domainId: string, page: string, viewport: string) {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_URL}/api/heatmaps/${domainId}/scroll?page=${encodeURIComponent(page)}&viewport=${viewport}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
}

// Color gradient for heatmap
function getHeatmapColor(intensity: number): string {
    // intensity is 0-1
    if (intensity < 0.25) return 'rgba(0, 100, 255, 0.4)';
    if (intensity < 0.5) return 'rgba(0, 255, 100, 0.5)';
    if (intensity < 0.75) return 'rgba(255, 255, 0, 0.6)';
    return 'rgba(255, 50, 0, 0.8)';
}

export default function HeatmapsPage() {
    const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
    const [pages, setPages] = useState<PageWithHeatmap[]>([]);
    const [selectedPage, setSelectedPage] = useState<string | null>(null);
    const [heatmapType, setHeatmapType] = useState<'click' | 'scroll'>('click');
    const [viewport, setViewport] = useState<'desktop' | 'mobile' | 'tablet'>('desktop');
    const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingHeatmap, setLoadingHeatmap] = useState(false);

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
        if (!selectedDomainId) return;

        setLoading(true);
        getPages(selectedDomainId).then(data => {
            setPages(data.pages || []);
            if (data.pages && data.pages.length > 0) {
                setSelectedPage(data.pages[0].path);
            }
            setLoading(false);
        });
    }, [selectedDomainId]);

    useEffect(() => {
        if (!selectedDomainId || !selectedPage) return;

        const loadHeatmap = async () => {
            setLoadingHeatmap(true);

            const getData = heatmapType === 'click' ? getClickHeatmap : getScrollHeatmap;
            const data = await getData(selectedDomainId, selectedPage, viewport);

            setHeatmapData({
                points: data.points || [],
                totalInteractions: data.totalInteractions || 0,
                uniqueVisitors: data.uniqueVisitors || 0
            });

            setLoadingHeatmap(false);
        };

        loadHeatmap();
    }, [selectedDomainId, selectedPage, heatmapType, viewport]);

    if (loading) {
        return (
            <div>
                <div className="skeleton" style={{ height: '40px', width: '200px', marginBottom: 'var(--space-xl)' }} />
                <div className="grid grid-cols-4 gap-lg">
                    <div className="card">
                        <div className="skeleton" style={{ height: '300px' }} />
                    </div>
                    <div style={{ gridColumn: 'span 3' }} className="card">
                        <div className="skeleton" style={{ height: '400px' }} />
                    </div>
                </div>
            </div>
        );
    }

    const maxCount = Math.max(...(heatmapData?.points.map(p => p.count) || [1]));

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-xl)' }}>
                <h1>Heatmaps</h1>
                <div className="flex items-center gap-md">
                    {/* Heatmap Type Toggle */}
                    <div style={{
                        display: 'flex',
                        background: 'var(--color-bg-card)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        overflow: 'hidden'
                    }}>
                        <button
                            onClick={() => setHeatmapType('click')}
                            style={{
                                padding: 'var(--space-sm) var(--space-md)',
                                background: heatmapType === 'click' ? 'var(--color-accent-primary)' : 'transparent',
                                border: 'none',
                                color: 'var(--color-text-primary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-xs)'
                            }}
                        >
                            <MousePointer2 size={16} />
                            Clicks
                        </button>
                        <button
                            onClick={() => setHeatmapType('scroll')}
                            style={{
                                padding: 'var(--space-sm) var(--space-md)',
                                background: heatmapType === 'scroll' ? 'var(--color-accent-primary)' : 'transparent',
                                border: 'none',
                                color: 'var(--color-text-primary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-xs)'
                            }}
                        >
                            <ArrowDown size={16} />
                            Scroll
                        </button>
                    </div>

                    {/* Viewport Toggle */}
                    <div style={{
                        display: 'flex',
                        background: 'var(--color-bg-card)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        overflow: 'hidden'
                    }}>
                        {[
                            { value: 'desktop', icon: Monitor },
                            { value: 'tablet', icon: Tablet },
                            { value: 'mobile', icon: Smartphone }
                        ].map(v => (
                            <button
                                key={v.value}
                                onClick={() => setViewport(v.value as any)}
                                style={{
                                    padding: 'var(--space-sm)',
                                    background: viewport === v.value ? 'var(--color-accent-primary)' : 'transparent',
                                    border: 'none',
                                    color: 'var(--color-text-primary)',
                                    cursor: 'pointer'
                                }}
                            >
                                <v.icon size={18} />
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {pages.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
                    <MousePointer2 size={48} style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-lg)' }} />
                    <h3 style={{ marginBottom: 'var(--space-sm)' }}>No heatmap data yet</h3>
                    <p>Start tracking to see click and scroll heatmaps</p>
                </div>
            ) : (
                <div className="grid grid-cols-4 gap-lg">
                    {/* Page List */}
                    <div>
                        <div className="card" style={{ padding: 0 }}>
                            <div style={{
                                padding: 'var(--space-md)',
                                borderBottom: '1px solid var(--color-border)',
                                fontSize: '0.875rem',
                                fontWeight: 500
                            }}>
                                Pages
                            </div>
                            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                                {pages.map(page => (
                                    <button
                                        key={page.path}
                                        onClick={() => setSelectedPage(page.path)}
                                        style={{
                                            width: '100%',
                                            padding: 'var(--space-md)',
                                            background: selectedPage === page.path ? 'var(--color-bg-hover)' : 'transparent',
                                            border: 'none',
                                            borderBottom: '1px solid var(--color-border)',
                                            textAlign: 'left',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <div style={{
                                            fontSize: '0.875rem',
                                            color: 'var(--color-text-primary)',
                                            marginBottom: 'var(--space-xs)',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {page.path}
                                        </div>
                                        <div className="flex items-center gap-md" style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                            <span>{page.clicks} clicks</span>
                                            <span>{page.visitors} visitors</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Heatmap Visualization */}
                    <div style={{ gridColumn: 'span 3' }}>
                        <div className="card">
                            <div className="card-header" style={{ marginBottom: 'var(--space-md)' }}>
                                <h4 className="card-title">
                                    {heatmapType === 'click' ? 'Click Heatmap' : 'Scroll Depth'}
                                </h4>
                                <div className="flex items-center gap-md">
                                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                        {heatmapData?.totalInteractions || 0} interactions
                                    </span>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                        {heatmapData?.uniqueVisitors || 0} visitors
                                    </span>
                                </div>
                            </div>

                            {loadingHeatmap ? (
                                <div style={{
                                    height: '400px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-accent-primary)' }} />
                                </div>
                            ) : heatmapType === 'click' ? (
                                /* Click Heatmap Grid */
                                <div style={{
                                    position: 'relative',
                                    width: '100%',
                                    aspectRatio: viewport === 'mobile' ? '9/16' : viewport === 'tablet' ? '3/4' : '16/9',
                                    maxWidth: viewport === 'mobile' ? '375px' : viewport === 'tablet' ? '768px' : '100%',
                                    margin: '0 auto',
                                    background: 'var(--color-bg-secondary)',
                                    borderRadius: 'var(--radius-md)',
                                    overflow: 'hidden'
                                }}>
                                    {/* Grid overlay */}
                                    {heatmapData?.points.map((point, i) => {
                                        const intensity = point.count / maxCount;
                                        return (
                                            <div
                                                key={i}
                                                style={{
                                                    position: 'absolute',
                                                    left: `${point.x - 5}%`,
                                                    top: `${point.y - 5}%`,
                                                    width: '10%',
                                                    height: '10%',
                                                    background: getHeatmapColor(intensity),
                                                    borderRadius: '50%',
                                                    filter: 'blur(10px)',
                                                    pointerEvents: 'none'
                                                }}
                                            />
                                        );
                                    })}

                                    {/* Page indicator */}
                                    <div style={{
                                        position: 'absolute',
                                        top: 'var(--space-md)',
                                        left: 'var(--space-md)',
                                        padding: 'var(--space-xs) var(--space-sm)',
                                        background: 'rgba(0,0,0,0.7)',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: '0.75rem'
                                    }}>
                                        {selectedPage}
                                    </div>
                                </div>
                            ) : (
                                /* Scroll Depth Visualization */
                                <div style={{ padding: 'var(--space-md)' }}>
                                    {heatmapData?.points.map((point, i) => {
                                        const intensity = heatmapData.uniqueVisitors > 0
                                            ? point.count / heatmapData.uniqueVisitors
                                            : 0;

                                        return (
                                            <div key={i} style={{ marginBottom: 'var(--space-md)' }}>
                                                <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-xs)' }}>
                                                    <span style={{ fontSize: '0.875rem' }}>{point.y}% scroll depth</span>
                                                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                                        {point.count} visitors ({Math.round(intensity * 100)}%)
                                                    </span>
                                                </div>
                                                <div style={{
                                                    height: '24px',
                                                    background: 'var(--color-bg-secondary)',
                                                    borderRadius: 'var(--radius-md)',
                                                    overflow: 'hidden'
                                                }}>
                                                    <div style={{
                                                        height: '100%',
                                                        width: `${intensity * 100}%`,
                                                        background: getHeatmapColor(1 - (point.y / 100)),
                                                        borderRadius: 'var(--radius-md)',
                                                        transition: 'width 0.3s ease'
                                                    }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Color Legend */}
                            <div className="flex items-center justify-center gap-md" style={{
                                marginTop: 'var(--space-lg)',
                                padding: 'var(--space-md)',
                                borderTop: '1px solid var(--color-border)'
                            }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Low</span>
                                <div style={{
                                    width: '150px',
                                    height: '8px',
                                    borderRadius: 'var(--radius-full)',
                                    background: 'linear-gradient(to right, rgba(0,100,255,0.4), rgba(0,255,100,0.5), rgba(255,255,0,0.6), rgba(255,50,0,0.8))'
                                }} />
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>High</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
