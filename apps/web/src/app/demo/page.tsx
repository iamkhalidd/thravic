'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    LayoutDashboard, Globe, Users, Target, MousePointer2,
    Video, Sparkles, FileBarChart, Settings, ChevronDown, ChevronRight,
    ArrowRight, TrendingUp, Calendar
} from 'lucide-react';
import {
    OverviewView, TrafficSourcesView, CampaignsView, TrendsView,
    BehaviorPagesView, FunnelsView, HeatmapsView, SessionsView,
    InsightsView, ReportsView
} from './DemoViews';

type DemoView = 'overview' | 'traffic-sources' | 'traffic-campaigns' | 'traffic-trends'
    | 'behavior-pages' | 'funnels' | 'heatmaps' | 'sessions' | 'insights' | 'reports';

const navStructure = [
    { id: 'overview' as DemoView, icon: LayoutDashboard, label: 'Overview' },
    {
        label: 'Traffic', icon: Globe, children: [
            { id: 'traffic-sources' as DemoView, label: 'Sources' },
            { id: 'traffic-campaigns' as DemoView, label: 'Campaigns' },
            { id: 'traffic-trends' as DemoView, label: 'Trends' },
        ]
    },
    {
        label: 'Behavior', icon: Users, children: [
            { id: 'behavior-pages' as DemoView, label: 'Pages' },
        ]
    },
    { id: 'funnels' as DemoView, icon: Target, label: 'Funnels' },
    { id: 'heatmaps' as DemoView, icon: MousePointer2, label: 'Heatmaps' },
    { id: 'sessions' as DemoView, icon: Video, label: 'Sessions' },
    { id: 'insights' as DemoView, icon: Sparkles, label: 'AI Insights' },
    { id: 'reports' as DemoView, icon: FileBarChart, label: 'Reports' },
];

const viewComponents: Record<DemoView, React.ComponentType> = {
    'overview': OverviewView,
    'traffic-sources': TrafficSourcesView,
    'traffic-campaigns': CampaignsView,
    'traffic-trends': TrendsView,
    'behavior-pages': BehaviorPagesView,
    'funnels': FunnelsView,
    'heatmaps': HeatmapsView,
    'sessions': SessionsView,
    'insights': InsightsView,
    'reports': ReportsView,
};

const datePresets = [
    { value: '7d', label: 'Last 7 days' },
    { value: '14d', label: 'Last 14 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
];

export default function DemoPage() {
    const [activeView, setActiveView] = useState<DemoView>('overview');
    const [expandedSections, setExpandedSections] = useState<string[]>(['Traffic', 'Behavior']);
    const [dateRange, setDateRange] = useState('7d');
    const [dateDropdownOpen, setDateDropdownOpen] = useState(false);

    const toggleSection = (label: string) => {
        setExpandedSections(prev =>
            prev.includes(label) ? prev.filter(s => s !== label) : [...prev, label]
        );
    };

    const isActive = (id: DemoView) => activeView === id;
    const isParentActive = (children: { id: DemoView }[]) => children.some(c => activeView === c.id);

    const ActiveComponent = viewComponents[activeView];
    const currentDatePreset = datePresets.find(p => p.value === dateRange);

    // Match real dashboard nav item style
    const navItemStyle = (active: boolean): React.CSSProperties => ({
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px',
        background: 'transparent',
        border: 'none',
        borderRadius: '6px',
        color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        cursor: 'pointer',
        fontSize: '0.8125rem',
        fontWeight: active ? 500 : 400,
        textDecoration: 'none',
        transition: 'all 150ms ease',
        textAlign: 'left' as const,
        whiteSpace: 'nowrap' as const,
        overflow: 'hidden',
    });

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
            {/* Demo Banner */}
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
                background: 'linear-gradient(90deg, var(--color-accent-primary), #E0B50F)',
                padding: '10px var(--space-md)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-md)'
            }}>
                <Sparkles size={16} color="white" />
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'white' }}>
                    You&apos;re viewing an interactive demo. Ready to track your own site?
                </span>
                <Link href="/register" style={{
                    fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px',
                    color: 'white', background: 'rgba(255,255,255,0.2)', padding: '6px 16px',
                    borderRadius: 'var(--radius-full)', textDecoration: 'none'
                }}>
                    Get Started Free <ArrowRight size={14} />
                </Link>
            </div>

            {/* Sidebar — matches real dashboard layout.tsx */}
            <aside style={{
                width: '240px',
                background: 'var(--color-sidebar-bg, var(--color-bg-secondary))',
                borderRight: '1px solid var(--color-sidebar-border, var(--color-border))',
                display: 'flex', flexDirection: 'column',
                position: 'fixed', top: '40px', left: 0, height: 'calc(100vh - 40px)', zIndex: 50
            }}>
                {/* Logo — matches real dashboard */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0 12px 0 16px', height: '56px',
                    borderBottom: '1px solid var(--color-sidebar-border, var(--color-border))',
                    flexShrink: 0,
                }}>
                    <Link href="/" style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        textDecoration: 'none', color: 'var(--color-text-primary)',
                    }}>
                        <div style={{
                            width: '28px', height: '28px', background: 'var(--color-accent-primary)',
                            borderRadius: '6px', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', flexShrink: 0,
                        }}>
                            <TrendingUp size={15} color="white" />
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '1rem', whiteSpace: 'nowrap' }}>Thravic</span>
                    </Link>
                    <span style={{
                        padding: '2px 8px', background: 'var(--color-bg-hover)',
                        color: 'var(--color-accent-primary)', borderRadius: 'var(--radius-full)',
                        fontSize: '0.6875rem', fontWeight: 600
                    }}>DEMO</span>
                </div>

                {/* Domain Selector — matches real dashboard */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-sidebar-border, var(--color-border))', flexShrink: 0 }}>
                    <div style={{ position: 'relative' }}>
                        <button style={{
                            width: '100%', display: 'flex', alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '7px 10px',
                            background: 'var(--color-bg-primary)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '6px', cursor: 'pointer',
                            fontSize: '0.8125rem', color: 'var(--color-text-primary)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Globe size={13} />
                                <span>demo-site.com</span>
                            </div>
                            <ChevronDown size={12} />
                        </button>
                    </div>
                </div>

                {/* Navigation — matches real dashboard */}
                <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {navStructure.map((item, i) => {
                            const Icon = item.icon;
                            const hasChildren = 'children' in item && item.children;
                            const isExpanded = hasChildren && expandedSections.includes(item.label);
                            const itemActive = 'id' in item && item.id ? isActive(item.id as DemoView) : hasChildren ? isParentActive(item.children!) : false;

                            if (hasChildren) {
                                return (
                                    <div key={i}>
                                        <button onClick={() => toggleSection(item.label)} style={navItemStyle(itemActive)}>
                                            <Icon size={18} style={{ flexShrink: 0 }} />
                                            <span style={{ flex: 1 }}>{item.label}</span>
                                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        </button>
                                        {isExpanded && (
                                            <div style={{ marginLeft: '15px', marginTop: '2px' }}>
                                                {item.children!.map((child, j) => {
                                                    const childActive = isActive(child.id);
                                                    return (
                                                        <button key={j} onClick={() => setActiveView(child.id)}
                                                            style={{
                                                                display: 'block', width: '100%', textAlign: 'left',
                                                                padding: '6px 12px 6px 28px',
                                                                color: childActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                                                fontSize: '0.8125rem', fontWeight: childActive ? 500 : 400,
                                                                background: 'transparent',
                                                                border: 'none', cursor: 'pointer',
                                                                transition: 'all 150ms ease',
                                                            }}
                                                        >
                                                            {child.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            return (
                                <button key={i} onClick={() => setActiveView(item.id!)} style={navItemStyle(itemActive)}>
                                    <Icon size={18} style={{ flexShrink: 0 }} />
                                    <span>{item.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </nav>

                {/* Bottom — Settings + User (matches real dashboard) */}
                <div style={{
                    borderTop: '1px solid var(--color-sidebar-border, var(--color-border))',
                    padding: '8px 0', flexShrink: 0,
                }}>
                    {/* Settings link */}
                    <button onClick={() => setActiveView('overview')} style={navItemStyle(false)}>
                        <Settings size={18} style={{ flexShrink: 0 }} />
                        <span>Settings</span>
                    </button>

                    {/* User row */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 12px', marginTop: '4px',
                    }}>
                        <div style={{
                            width: '28px', height: '28px', borderRadius: '50%',
                            background: 'var(--color-accent-primary)', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', color: 'white',
                            fontWeight: 700, fontSize: '0.75rem', flexShrink: 0,
                        }}>D</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                fontSize: '0.8125rem', fontWeight: 500,
                                color: 'var(--color-text-primary)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>Demo User</div>
                            <div style={{
                                fontSize: '0.6875rem', color: 'var(--color-text-muted)',
                                textTransform: 'capitalize',
                            }}>Free Plan</div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content — matches real dashboard layout */}
            <main style={{ flex: 1, marginLeft: '240px', marginTop: '40px' }}>
                {/* Top Header — matches real dashboard header */}
                <header style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0 16px', height: '52px',
                    background: 'var(--color-bg-card)',
                    borderBottom: '1px solid var(--color-border)',
                    position: 'sticky', top: '40px', zIndex: 40,
                    gap: '8px',
                }}>
                    {/* Left: date controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                    padding: '5px 10px',
                                    background: 'var(--color-bg-primary)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '6px', cursor: 'pointer',
                                    fontSize: '0.8125rem', color: 'var(--color-text-primary)',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                <Calendar size={13} />
                                <span>{currentDatePreset?.label || 'Date range'}</span>
                                <ChevronDown size={12} />
                            </button>
                            {dateDropdownOpen && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0,
                                    marginTop: '4px', background: 'var(--color-bg-card)',
                                    border: '1px solid var(--color-border)', borderRadius: '6px',
                                    boxShadow: 'var(--shadow-md)', zIndex: 100, minWidth: '160px',
                                }}>
                                    {datePresets.map(preset => (
                                        <button
                                            key={preset.value}
                                            onClick={() => { setDateRange(preset.value); setDateDropdownOpen(false); }}
                                            style={{
                                                width: '100%', padding: '8px 12px',
                                                background: dateRange === preset.value ? 'var(--color-bg-hover)' : 'transparent',
                                                border: 'none', textAlign: 'left', cursor: 'pointer',
                                                fontSize: '0.8125rem',
                                                color: dateRange === preset.value ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
                                            }}
                                        >{preset.label}</button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {activeView === 'overview' && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '4px 10px',
                                background: 'rgba(16,185,129,0.08)',
                                border: '1px solid rgba(16,185,129,0.2)',
                                borderRadius: '6px',
                            }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
                                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}><strong>127</strong> active</span>
                            </div>
                        )}
                    </div>
                </header>

                {/* Page Content */}
                <div style={{ padding: '24px' }}>
                    <ActiveComponent />
                </div>
            </main>

            <style jsx global>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
