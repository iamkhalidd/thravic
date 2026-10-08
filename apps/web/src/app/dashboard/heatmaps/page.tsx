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
import { useDomain } from '@/contexts/DomainContext';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface PageWithHeatmap {
    path: string;
    clicks: number;
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
    unplacedInteractions: number;
    uniqueVisitors: number;
}

async function getPages(domainId: string) {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_URL}/api/heatmaps/${domainId}/pages`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
}

// The API serves one endpoint for both heatmap types, selected with ?type=click|scroll.
// `viewport` limits it to sessions of that device class (by screen width).
async function getHeatmap(domainId: string, type: 'click' | 'scroll', page: string, viewport: string) {
    const token = localStorage.getItem('accessToken');
    const params = new URLSearchParams({ type, page, viewport });
    const res = await fetch(`${API_URL}/api/heatmaps/${domainId}?${params}`, {
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


const TYPES = [
    { value: 'click', label: 'Clicks', icon: MousePointer2 },
    { value: 'scroll', label: 'Scroll', icon: ArrowDown },
] as const;

const VIEWPORTS = [
    { value: 'desktop', label: 'Desktop', icon: Monitor },
    { value: 'tablet', label: 'Tablet', icon: Tablet },
    { value: 'mobile', label: 'Mobile', icon: Smartphone },
] as const;

const segmentButton = { display: 'inline-flex', alignItems: 'center', gap: 6 } as const;

export default function HeatmapsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [pages, setPages] = useState<PageWithHeatmap[]>([]);
    const [selectedPage, setSelectedPage] = useState<string | null>(null);
    const [heatmapType, setHeatmapType] = useState<'click' | 'scroll'>('click');
    const [viewport, setViewport] = useState<'desktop' | 'mobile' | 'tablet'>('desktop');
    const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingHeatmap, setLoadingHeatmap] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // The heatmap API always covers its own fixed 30-day window; it takes no date range.
    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainLoading) setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        getPages(selectedDomainId)
            .then(data => {
                if (cancelled) return;
                setError(data.error ? String(data.error) : null);
                setPages(data.pages || []);
                // Reset on every domain switch so a page from the previous domain is not kept.
                setSelectedPage(data.pages?.length ? data.pages[0].path : null);
            })
            .catch(() => { if (!cancelled) setError('Network error'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [selectedDomainId, domainLoading]);

    useEffect(() => {
        if (!selectedDomainId || !selectedPage) return;

        let cancelled = false;
        const loadHeatmap = async () => {
            setLoadingHeatmap(true);

            const data = await getHeatmap(selectedDomainId, heatmapType, selectedPage, viewport).catch(() => ({}));
            if (cancelled) return;

            setHeatmapData({
                points: data.points || [],
                totalInteractions: data.totalInteractions || 0,
                unplacedInteractions: data.unplacedInteractions || 0,
                uniqueVisitors: data.uniqueVisitors || 0
            });

            setLoadingHeatmap(false);
        };

        loadHeatmap();
        return () => { cancelled = true; };
    }, [selectedDomainId, selectedPage, heatmapType, viewport]);

    const maxCount = Math.max(...(heatmapData?.points.map(p => p.count) || [1]));
    const busy = loading || domainLoading;

    const controls = (
        <>
            <div className="segmented" role="tablist" aria-label="Heatmap type">
                {TYPES.map(t => (
                    <button
                        key={t.value}
                        type="button"
                        role="tab"
                        aria-selected={heatmapType === t.value}
                        onClick={() => setHeatmapType(t.value)}
                        style={segmentButton}
                    >
                        <t.icon size={14} aria-hidden="true" />
                        {t.label}
                    </button>
                ))}
            </div>
            <div className="segmented" role="tablist" aria-label="Device">
                {VIEWPORTS.map(v => (
                    <button
                        key={v.value}
                        type="button"
                        role="tab"
                        aria-selected={viewport === v.value}
                        onClick={() => setViewport(v.value)}
                        title={`${v.label} visitors`}
                        style={segmentButton}
                    >
                        <v.icon size={14} aria-hidden="true" />
                        {v.label}
                    </button>
                ))}
            </div>
        </>
    );

    return (
        <div className="page-stack">
            <PageHeader
                title="Heatmaps"
                subtitle="Where visitors click and how far they scroll, over the last 30 days."
                actions={controls}
            />

            {!selectedDomainId && !domainLoading ? (
                <div className="card"><div className="empty-note">Select a site to see its heatmaps.</div></div>
            ) : error ? (
                <div className="card">
                    <div className="empty-note" role="alert" style={{ color: 'var(--color-error)' }}>
                        Couldn&apos;t load heatmaps: {error}
                    </div>
                </div>
            ) : !busy && pages.length === 0 ? (
                <ChartCard title="Pages">
                    <div className="empty-note">No clicks recorded yet. Heatmaps appear once visitors interact with your pages.</div>
                </ChartCard>
            ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
                    {/* Page list */}
                    <div style={{ flex: '1 1 240px', minWidth: 0, maxWidth: '100%' }}>
                        <ChartCard title="Pages" subtitle="By clicks" flush loading={busy} height={300}>
                            <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, maxHeight: 520, overflowY: 'auto', borderTop: '1px solid var(--color-border)' }}>
                                {pages.map(page => {
                                    const active = selectedPage === page.path;
                                    return (
                                        <li key={page.path}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedPage(page.path)}
                                                aria-current={active ? 'true' : undefined}
                                                style={{
                                                    width: '100%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: 12,
                                                    padding: '8px 20px',
                                                    minHeight: 36,
                                                    background: active ? 'var(--color-bg-hover)' : 'transparent',
                                                    border: 'none',
                                                    borderBottom: '1px solid var(--color-border)',
                                                    boxShadow: active ? 'inset 2px 0 0 var(--color-text-primary)' : 'none',
                                                    textAlign: 'left',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8125rem',
                                                    color: 'var(--color-text-primary)',
                                                    fontWeight: active ? 500 : 400,
                                                }}
                                            >
                                                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={page.path}>
                                                    {page.path}
                                                </span>
                                                <span style={{ flexShrink: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', fontWeight: 400 }}>
                                                    {page.clicks.toLocaleString()} clicks · {page.visitors.toLocaleString()} visitors
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </ChartCard>
                    </div>

                    {/* Heatmap visualization */}
                    <div style={{ flex: '3 1 520px', minWidth: 0, maxWidth: '100%' }}>
                        <ChartCard
                            title={heatmapType === 'click' ? 'Click heatmap' : 'Scroll depth'}
                            subtitle={selectedPage ?? undefined}
                            action={
                                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                    {(heatmapData?.totalInteractions || 0).toLocaleString()} interactions · {(heatmapData?.uniqueVisitors || 0).toLocaleString()} visitors
                                </span>
                            }
                            loading={busy}
                            height={400}
                        >

                            {loadingHeatmap ? (
                                <div style={{
                                    height: '400px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
                                </div>
                            ) : heatmapType === 'click' ? (
                                /* Click Heatmap Grid */
                                <>
                                <div style={{
                                    position: 'relative',
                                    width: '100%',
                                    // Points are percentages of the whole page, not of one screen.
                                    aspectRatio: viewport === 'mobile' ? '9/16' : viewport === 'tablet' ? '3/4' : '4/3',
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
                                        background: 'var(--color-bg-card)',
                                        border: '1px solid var(--color-border)',
                                        color: 'var(--color-text-primary)',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: '0.75rem'
                                    }}>
                                        {selectedPage}
                                    </div>
                                </div>
                                <p style={{ marginTop: 'var(--space-sm)', fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                                    The canvas is the whole page: left to right is the screen width, top to bottom is the full page height.
                                    {(heatmapData?.unplacedInteractions ?? 0) > 0 && (
                                        <> {heatmapData!.unplacedInteractions.toLocaleString()} older clicks were recorded before click positions were captured and are not shown.</>
                                    )}
                                </p>
                                </>
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

                            {/* Color legend */}
                            <div className="flex items-center justify-center gap-md" style={{
                                marginTop: 16,
                                paddingTop: 12,
                                borderTop: '1px solid var(--color-border)'
                            }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Low</span>
                                <div style={{
                                    width: '150px',
                                    height: '8px',
                                    borderRadius: 'var(--radius-full)',
                                    background: 'linear-gradient(to right, rgba(0,100,255,0.4), rgba(0,255,100,0.5), rgba(255,255,0,0.6), rgba(255,50,0,0.8))'
                                }} />
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>High</span>
                            </div>
                        </ChartCard>
                    </div>
                </div>
            )}
        </div>
    );
}
