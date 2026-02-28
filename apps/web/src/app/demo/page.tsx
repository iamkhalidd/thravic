'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    BarChart3, LayoutDashboard, Globe, Users, Target, MousePointer2,
    Video, Sparkles, FileBarChart, Settings, ChevronDown, ChevronRight,
    ArrowRight, Sun, Moon, TrendingUp, Megaphone
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
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

const viewTitles: Record<DemoView, string> = {
    'overview': 'Dashboard',
    'traffic-sources': 'Traffic Sources',
    'traffic-campaigns': 'Campaigns',
    'traffic-trends': 'Trends',
    'behavior-pages': 'Behavior – Pages',
    'funnels': 'Funnels',
    'heatmaps': 'Heatmaps',
    'sessions': 'Session Recordings',
    'insights': 'AI Insights',
    'reports': 'Reports',
};

export default function DemoPage() {
    const [activeView, setActiveView] = useState<DemoView>('overview');
    const [expandedSections, setExpandedSections] = useState<string[]>(['Traffic', 'Behavior']);
    const [dateRange, setDateRange] = useState('7d');
    const [domainDropdownOpen, setDomainDropdownOpen] = useState(false);
    const { theme, toggleTheme } = useTheme();

    const toggleSection = (label: string) => {
        setExpandedSections(prev =>
            prev.includes(label) ? prev.filter(s => s !== label) : [...prev, label]
        );
    };

    const isActive = (id: DemoView) => activeView === id;
    const isParentActive = (children: { id: DemoView }[]) => children.some(c => activeView === c.id);

    const ActiveComponent = viewComponents[activeView];

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
            {/* Demo Banner */}
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
                background: 'linear-gradient(90deg, #F29F67, #E0B50F)',
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

            {/* Sidebar */}
            <aside style={{
                width: '260px', background: 'var(--color-bg-secondary)',
                borderRight: '1px solid var(--color-border)',
                display: 'flex', flexDirection: 'column',
                position: 'fixed', top: '40px', left: 0, height: 'calc(100vh - 40px)', zIndex: 50
            }}>
                {/* Logo */}
                <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--color-border)' }}>
                    <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', textDecoration: 'none', color: 'var(--color-text-primary)' }}>
                        <div style={{ width: '32px', height: '32px', background: 'var(--gradient-primary)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <BarChart3 size={18} color="white" />
                        </div>
                        <span style={{ fontSize: '1.125rem', fontWeight: 700 }}>TrackFlow</span>
                        <span style={{ marginLeft: '4px', padding: '2px 8px', background: 'rgba(242,159,103,0.2)', color: '#F29F67', borderRadius: 'var(--radius-full)', fontSize: '0.6875rem', fontWeight: 600 }}>DEMO</span>
                    </Link>
                </div>

                {/* Domain Selector */}
                <div style={{ padding: 'var(--space-md)' }}>
                    <button onClick={() => setDomainDropdownOpen(!domainDropdownOpen)} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
                        padding: 'var(--space-sm) var(--space-md)', background: 'var(--color-bg-tertiary)',
                        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                        color: 'var(--color-text-primary)', cursor: 'pointer', fontSize: '0.875rem'
                    }}>
                        <Globe size={16} style={{ color: 'var(--color-primary)' }} />
                        <span style={{ flex: 1, textAlign: 'left', fontWeight: 500 }}>demo-site.com</span>
                        <ChevronDown size={14} />
                    </button>
                </div>

                {/* Navigation */}
                <nav style={{ flex: 1, padding: 'var(--space-sm) var(--space-md)', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {navStructure.map((item, i) => {
                            const Icon = item.icon;
                            const hasChildren = 'children' in item && item.children;
                            const isExpanded = hasChildren && expandedSections.includes(item.label);
                            const itemActive = 'id' in item && item.id ? isActive(item.id as DemoView) : hasChildren ? isParentActive(item.children!) : false;

                            if (hasChildren) {
                                return (
                                    <div key={i}>
                                        <button onClick={() => toggleSection(item.label)} style={{
                                            width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
                                            padding: 'var(--space-sm) var(--space-md)', background: itemActive ? 'rgba(242,159,103,0.1)' : 'transparent',
                                            border: 'none', borderRadius: 'var(--radius-md)',
                                            color: itemActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                            cursor: 'pointer', fontSize: '0.875rem', fontWeight: itemActive ? 500 : 400,
                                        }}>
                                            <Icon size={18} />
                                            <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        </button>
                                        {isExpanded && (
                                            <div style={{ marginLeft: 'var(--space-lg)', marginTop: '2px' }}>
                                                {item.children!.map((child, j) => (
                                                    <button key={j} onClick={() => setActiveView(child.id)}
                                                        style={{
                                                            display: 'block', width: '100%', textAlign: 'left',
                                                            padding: 'var(--space-xs) var(--space-md)',
                                                            color: isActive(child.id) ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                                            fontSize: '0.8125rem', borderRadius: 'var(--radius-sm)',
                                                            background: isActive(child.id) ? 'rgba(242,159,103,0.1)' : 'transparent',
                                                            border: 'none', cursor: 'pointer',
                                                        }}
                                                    >
                                                        {child.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            return (
                                <button key={i} onClick={() => setActiveView(item.id!)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
                                        padding: 'var(--space-sm) var(--space-md)', width: '100%', textAlign: 'left',
                                        background: itemActive ? 'rgba(242,159,103,0.1)' : 'transparent',
                                        borderRadius: 'var(--radius-md)', border: 'none',
                                        color: itemActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                        fontSize: '0.875rem', fontWeight: itemActive ? 500 : 400, cursor: 'pointer',
                                    }}
                                >
                                    <Icon size={18} />
                                    <span>{item.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </nav>

                {/* User Section */}
                <div style={{ padding: 'var(--space-md)', borderTop: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: 'var(--space-sm)' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-full)', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.875rem', color: 'white' }}>DU</div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>Demo User</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>Free Plan</div>
                        </div>
                        <Settings size={16} style={{ color: 'var(--color-text-tertiary)', cursor: 'pointer' }} />
                        <button onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                            style={{
                                padding: 'var(--space-xs)', background: 'var(--color-bg-tertiary)',
                                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                                color: 'var(--color-text-tertiary)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                        >
                            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main style={{ flex: 1, marginLeft: '260px', marginTop: '40px', padding: 'var(--space-xl)' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-xl)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{viewTitles[activeView]}</h1>
                        {activeView === 'overview' && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
                                padding: 'var(--space-sm) var(--space-md)',
                                background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                                borderRadius: 'var(--radius-md)'
                            }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-success, #22c55e)', animation: 'pulse 2s infinite' }} />
                                <span style={{ fontSize: '0.875rem' }}><strong>127</strong> active now</span>
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                        <select value={dateRange} onChange={e => setDateRange(e.target.value)} style={{
                            padding: 'var(--space-sm) var(--space-md)', background: 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                            color: 'var(--color-text-primary)', fontSize: '0.875rem', cursor: 'pointer'
                        }}>
                            <option value="7d">Last 7 days</option>
                            <option value="14d">Last 14 days</option>
                            <option value="30d">Last 30 days</option>
                            <option value="90d">Last 90 days</option>
                        </select>
                    </div>
                </div>

                {/* Active View Content */}
                <ActiveComponent />
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
