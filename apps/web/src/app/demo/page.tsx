'use client';

// The public demo. The shell mirrors app/dashboard/layout.tsx and uses the same
// dash-* classes, so it collapses to an off-canvas sidebar on small screens.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ThemedLogo } from '@/components/ThemedLogo';
import {
    LayoutDashboard, Globe, Users, Target, MousePointer2, Video, Sparkles, FileBarChart,
    Settings, ChevronDown, ChevronRight, ArrowRight, TrendingUp, Calendar, PanelLeftClose,
    PanelLeftOpen, Gauge, UsersRound, Menu, RefreshCw, Download,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
    OverviewView, TrafficSourcesView, CampaignsView, TrendsView,
    BehaviorPagesView, FunnelsView, HeatmapsView, SessionsView,
    InsightsView, ReportsView, BehaviorPathsView, BehaviorDevicesView,
    ErrorsView, PerformanceView, FormsView, RageClicksView, TeamView, SettingsView,
} from './DemoViews';

type DemoView = 'overview' | 'traffic-sources' | 'traffic-campaigns' | 'traffic-trends'
    | 'behavior-pages' | 'behavior-paths' | 'behavior-devices' | 'funnels' | 'heatmaps' | 'sessions' | 'insights' | 'reports'
    | 'monitoring-errors' | 'monitoring-performance' | 'monitoring-forms' | 'monitoring-rage-clicks' | 'team' | 'settings';

interface NavLeaf { id: DemoView; label: string }
interface NavEntry { label: string; icon: React.ElementType; id?: DemoView; children?: NavLeaf[] }

const navStructure: NavEntry[] = [
    { id: 'overview', icon: LayoutDashboard, label: 'Dashboard' },
    {
        label: 'Traffic', icon: Globe, children: [
            { id: 'traffic-sources', label: 'Sources' },
            { id: 'traffic-campaigns', label: 'Campaigns' },
            { id: 'traffic-trends', label: 'Trends' },
        ],
    },
    {
        label: 'Behavior', icon: Users, children: [
            { id: 'behavior-pages', label: 'Pages' },
            { id: 'behavior-paths', label: 'Paths' },
            { id: 'behavior-devices', label: 'Devices' },
        ],
    },
    {
        label: 'Monitoring', icon: Gauge, children: [
            { id: 'monitoring-errors', label: 'Errors' },
            { id: 'monitoring-performance', label: 'Performance' },
            { id: 'monitoring-forms', label: 'Forms' },
            { id: 'monitoring-rage-clicks', label: 'Rage Clicks' },
        ],
    },
    { id: 'funnels', icon: Target, label: 'Funnels' },
    { id: 'heatmaps', icon: MousePointer2, label: 'Heatmaps' },
    { id: 'sessions', icon: Video, label: 'Sessions' },
    { id: 'insights', icon: Sparkles, label: 'AI Insights' },
    { id: 'reports', icon: FileBarChart, label: 'Reports' },
];

const viewComponents: Record<DemoView, React.ComponentType> = {
    'overview': OverviewView,
    'traffic-sources': TrafficSourcesView,
    'traffic-campaigns': CampaignsView,
    'traffic-trends': TrendsView,
    'behavior-pages': BehaviorPagesView,
    'behavior-paths': BehaviorPathsView,
    'behavior-devices': BehaviorDevicesView,
    'monitoring-errors': ErrorsView,
    'monitoring-performance': PerformanceView,
    'monitoring-forms': FormsView,
    'monitoring-rage-clicks': RageClicksView,
    'funnels': FunnelsView,
    'heatmaps': HeatmapsView,
    'sessions': SessionsView,
    'insights': InsightsView,
    'reports': ReportsView,
    'team': TeamView,
    'settings': SettingsView,
};

const datePresets = [
    { value: '7d', label: 'Last 7 days' },
    { value: '14d', label: 'Last 14 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
];

const headerButton: React.CSSProperties = {
    alignItems: 'center', gap: '6px', padding: '5px 10px',
    background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
    borderRadius: '6px', cursor: 'pointer', fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)', whiteSpace: 'nowrap',
};

export default function DemoPage() {
    const [activeView, setActiveView] = useState<DemoView>('overview');
    const [expandedSections, setExpandedSections] = useState<string[]>(['Traffic', 'Behavior']);
    const [dateRange, setDateRange] = useState('14d');
    const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [comparisonEnabled, setComparisonEnabled] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    // Landing page links open a specific view, e.g. /demo?view=sessions
    useEffect(() => {
        const view = new URLSearchParams(window.location.search).get('view');
        if (view && view in viewComponents) setActiveView(view as DemoView);
    }, []);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 1024);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // On mobile the sidebar is a 240px overlay and the collapse state is ignored.
    const collapsed = sidebarCollapsed && !isMobile;
    const sidebarWidth = isMobile ? 240 : (sidebarCollapsed ? 56 : 240);
    const mainMarginLeft = isMobile ? 0 : sidebarWidth;

    const toggleSidebar = () => {
        if (isMobile) setMobileSidebarOpen(open => !open);
        else setSidebarCollapsed(c => !c);
    };

    const go = (view: DemoView) => {
        setActiveView(view);
        setMobileSidebarOpen(false);
        window.scrollTo({ top: 0 });
    };

    const toggleSection = (label: string) => {
        setExpandedSections(prev => prev.includes(label) ? prev.filter(s => s !== label) : [...prev, label]);
    };

    const ActiveComponent = viewComponents[activeView];
    const currentDatePreset = datePresets.find(p => p.value === dateRange);

    const navItemStyle = (active: boolean): React.CSSProperties => ({
        width: '100%', display: 'flex', alignItems: 'center',
        gap: collapsed ? '0' : '10px',
        padding: collapsed ? '10px 0' : '8px 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        background: 'transparent', border: 'none', borderRadius: '6px',
        color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        cursor: 'pointer', fontSize: '0.8125rem', fontWeight: active ? 500 : 400,
        transition: 'all 150ms ease', textAlign: 'left',
        whiteSpace: 'nowrap', overflow: 'hidden',
    });

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg-primary)' }}>

            {/* ── Sidebar ── */}
            <aside className={`dash-sidebar${mobileSidebarOpen ? ' mobile-open' : ''}`} style={{ width: `${sidebarWidth}px` }}>
                <div style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: collapsed ? 'center' : 'space-between',
                    padding: collapsed ? '16px 0' : '0 12px 0 16px', height: '56px',
                    borderBottom: '1px solid var(--color-sidebar-border)', flexShrink: 0,
                }}>
                    {!collapsed && (
                        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: 'var(--color-text-primary)' }}>
                            <ThemedLogo height={22} />
                        </Link>
                    )}
                    <button
                        type="button"
                        onClick={toggleSidebar}
                        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        style={{
                            padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer',
                            color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center',
                            borderRadius: '4px', flexShrink: 0, marginLeft: collapsed ? '0' : 'auto',
                        }}
                    >
                        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                    </button>
                </div>

                {!collapsed && (
                    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-sidebar-border)', flexShrink: 0 }}>
                        <div style={{
                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '7px 10px', background: 'var(--color-bg-primary)',
                            border: '1px solid var(--color-border)', borderRadius: '6px',
                            fontSize: '0.8125rem', color: 'var(--color-text-primary)',
                        }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Globe size={13} />
                                demo-site.com
                            </span>
                            <ChevronDown size={12} />
                        </div>
                    </div>
                )}

                <nav aria-label="Demo dashboard" className="no-scrollbar" style={{
                    flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: collapsed ? '8px 4px' : '8px 0',
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {navStructure.map(item => {
                            const Icon = item.icon;
                            if (item.children) {
                                const expanded = expandedSections.includes(item.label);
                                const active = item.children.some(c => c.id === activeView);
                                return (
                                    <div key={item.label}>
                                        <button type="button" onClick={() => toggleSection(item.label)} aria-expanded={expanded}
                                            style={navItemStyle(active)} title={collapsed ? item.label : undefined}>
                                            <Icon size={18} style={{ flexShrink: 0 }} />
                                            {!collapsed && (
                                                <>
                                                    <span style={{ flex: 1 }}>{item.label}</span>
                                                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </>
                                            )}
                                        </button>
                                        {expanded && !collapsed && (
                                            <div style={{ marginLeft: '15px', marginTop: '2px' }}>
                                                {item.children.map(child => {
                                                    const childActive = child.id === activeView;
                                                    return (
                                                        <button key={child.id} type="button" onClick={() => go(child.id)}
                                                            aria-current={childActive ? 'page' : undefined}
                                                            style={{
                                                                display: 'block', width: '100%', textAlign: 'left',
                                                                padding: '6px 12px 6px 28px', background: 'transparent', border: 'none', cursor: 'pointer',
                                                                color: childActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                                                fontSize: '0.8125rem', fontWeight: childActive ? 500 : 400,
                                                                transition: 'all 150ms ease',
                                                            }}>
                                                            {child.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            }
                            const active = item.id === activeView;
                            return (
                                <button key={item.label} type="button" onClick={() => go(item.id!)} aria-current={active ? 'page' : undefined}
                                    style={navItemStyle(active)} title={collapsed ? item.label : undefined}>
                                    <Icon size={18} style={{ flexShrink: 0 }} />
                                    {!collapsed && <span>{item.label}</span>}
                                </button>
                            );
                        })}
                    </div>
                </nav>

                <div style={{ borderTop: '1px solid var(--color-sidebar-border)', padding: collapsed ? '8px 4px' : '8px 0', flexShrink: 0 }}>
                    <button type="button" onClick={() => go('team')} style={navItemStyle(activeView === 'team')} title={collapsed ? 'Team' : undefined}>
                        <UsersRound size={18} style={{ flexShrink: 0 }} />
                        {!collapsed && <span>Team</span>}
                    </button>
                    <button type="button" onClick={() => go('settings')} style={navItemStyle(activeView === 'settings')} title={collapsed ? 'Settings' : undefined}>
                        <Settings size={18} style={{ flexShrink: 0 }} />
                        {!collapsed && <span>Settings</span>}
                    </button>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: collapsed ? '0' : '8px',
                        padding: collapsed ? '8px 0' : '8px 12px', marginTop: '4px',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                    }}>
                        <div aria-hidden="true" style={{
                            width: '28px', height: '28px', borderRadius: '50%', background: 'var(--color-accent-primary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                            fontWeight: 700, fontSize: '0.75rem', flexShrink: 0,
                        }}>D</div>
                        {!collapsed && (
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Demo User</div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>demo@example.com</div>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* ── Main ── */}
            <main className="dash-main" style={{ marginLeft: `${mainMarginLeft}px` }}>
                {/* Sits where the real dashboard shows its announcement banners. */}
                <div className="demo-banner">
                    <span>This is a demo with sample data.</span>
                    <Link href="/register" className="demo-banner-link">
                        Track your own site <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                </div>

                <header style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0 16px', height: '52px', background: 'var(--color-bg-card)',
                    borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 40, gap: '8px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                        <button type="button" className="dash-hamburger" onClick={() => setMobileSidebarOpen(o => !o)}
                            title="Toggle menu" aria-label="Open menu" aria-expanded={mobileSidebarOpen}>
                            <Menu size={18} />
                        </button>

                        <div style={{ position: 'relative' }}>
                            <button type="button" onClick={() => setDateDropdownOpen(o => !o)} aria-expanded={dateDropdownOpen}
                                style={{ ...headerButton, display: 'flex', gap: '5px', color: 'var(--color-text-primary)' }}>
                                <Calendar size={13} />
                                <span>{currentDatePreset?.label || 'Date range'}</span>
                                <ChevronDown size={12} />
                            </button>
                            {dateDropdownOpen && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                                    background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '6px',
                                    boxShadow: 'var(--shadow-md)', zIndex: 100, minWidth: '150px',
                                }}>
                                    {datePresets.map(preset => (
                                        <button key={preset.value} type="button"
                                            onClick={() => { setDateRange(preset.value); setDateDropdownOpen(false); }}
                                            style={{
                                                width: '100%', padding: '8px 12px', border: 'none', textAlign: 'left', cursor: 'pointer',
                                                fontSize: '0.8125rem',
                                                background: dateRange === preset.value ? 'var(--color-bg-hover)' : 'transparent',
                                                color: dateRange === preset.value ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
                                            }}>{preset.label}</button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button type="button" className="desktop-only" onClick={() => setComparisonEnabled(c => !c)} aria-pressed={comparisonEnabled}
                            style={{
                                ...headerButton,
                                background: comparisonEnabled ? 'var(--color-bg-hover)' : 'var(--color-bg-primary)',
                                border: `1px solid ${comparisonEnabled ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                                color: comparisonEnabled ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                            }}>
                            <TrendingUp size={13} />
                            <span>Compare</span>
                        </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <ThemeToggle />
                        <button type="button" className="desktop-only" style={headerButton} title="Live updates are off in the demo" disabled>
                            <RefreshCw size={13} />
                            <span>Live</span>
                        </button>
                        <button type="button" className="desktop-only" style={headerButton} onClick={() => go('reports')}>
                            <Download size={13} />
                            <span>Export</span>
                        </button>
                    </div>
                </header>

                <div className="dash-content">
                    <ActiveComponent />
                </div>
            </main>

            <div className={`dash-sidebar-overlay${mobileSidebarOpen ? ' active' : ''}`} onClick={() => setMobileSidebarOpen(false)} />
        </div>
    );
}
