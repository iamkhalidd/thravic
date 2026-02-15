'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    BarChart3,
    LayoutDashboard,
    Globe,
    Users,
    Target,
    MousePointer2,
    Video,
    Sparkles,
    FileBarChart,
    Settings,
    LogOut,
    ChevronDown,
    ChevronRight,
    Eye,
    Clock,
    TrendingUp,
    RefreshCw,
    ArrowRight,
    Plus,
    Calendar,
    Sun,
    Moon
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts';

// Navigation structure matching real dashboard
const navStructure = [
    { href: '#', icon: LayoutDashboard, label: 'Overview', exact: true, active: true },
    {
        label: 'Traffic',
        icon: Globe,
        children: [
            { href: '#', label: 'Sources' },
            { href: '#', label: 'Campaigns' },
            { href: '#', label: 'Trends' }
        ]
    },
    {
        label: 'Behavior',
        icon: Users,
        children: [
            { href: '#', label: 'Pages' },
            { href: '#', label: 'Paths' },
            { href: '#', label: 'Devices' }
        ]
    },
    { href: '#', icon: Target, label: 'Funnels' },
    { href: '#', icon: MousePointer2, label: 'Heatmaps' },
    { href: '#', icon: Video, label: 'Sessions' },
    { href: '#', icon: Sparkles, label: 'AI Insights' },
    { href: '#', icon: FileBarChart, label: 'Reports' },
];

// Demo data matching real dashboard
const trafficData = [
    { date: '2024-01-01', pageviews: 1200, visitors: 450 },
    { date: '2024-01-02', pageviews: 1350, visitors: 520 },
    { date: '2024-01-03', pageviews: 980, visitors: 380 },
    { date: '2024-01-04', pageviews: 1580, visitors: 620 },
    { date: '2024-01-05', pageviews: 2100, visitors: 890 },
    { date: '2024-01-06', pageviews: 1890, visitors: 780 },
    { date: '2024-01-07', pageviews: 2340, visitors: 950 },
];

const sourceData = [
    { name: 'Direct', value: 3240, color: '#6366f1' },
    { name: 'Organic', value: 2180, color: '#8b5cf6' },
    { name: 'Social', value: 1560, color: '#a855f7' },
    { name: 'Referral', value: 890, color: '#d946ef' },
    { name: 'Paid', value: 520, color: '#ec4899' },
    { name: 'Email', value: 340, color: '#f43f5e' }
];

const topPages = [
    { path: '/', views: 8450 },
    { path: '/pricing', views: 3200 },
    { path: '/features', views: 2180 },
    { path: '/blog/getting-started', views: 1560 },
    { path: '/contact', views: 980 },
    { path: '/about', views: 720 },
    { path: '/docs', views: 540 },
    { path: '/blog/analytics-tips', views: 380 }
];

const activePages = [
    { path: '/', count: 12 },
    { path: '/pricing', count: 8 },
    { path: '/features', count: 5 },
    { path: '/docs', count: 3 },
    { path: '/blog', count: 2 }
];

export default function DemoPage() {
    const [expandedSections, setExpandedSections] = useState<string[]>(['Traffic', 'Behavior']);
    const [dateRange, setDateRange] = useState('7d');
    const [domainDropdownOpen, setDomainDropdownOpen] = useState(false);
    const { theme, toggleTheme } = useTheme();

    const toggleSection = (label: string) => {
        setExpandedSections(prev =>
            prev.includes(label)
                ? prev.filter(s => s !== label)
                : [...prev, label]
        );
    };

    const statCards = [
        { label: 'Total Pageviews', value: '12,485', icon: BarChart3, color: '#6366f1' },
        { label: 'Unique Visitors', value: '4,230', icon: Users, color: '#8b5cf6' },
        { label: 'Bounce Rate', value: '42.3%', icon: MousePointer2, color: '#f59e0b' },
        { label: 'Avg. Session', value: '3m 24s', icon: Clock, color: '#10b981' }
    ];

    const quickActions = [
        { href: '#', icon: Globe, label: 'Traffic Sources', desc: 'View source breakdown' },
        { href: '#', icon: Target, label: 'Funnels', desc: 'Track conversions' },
        { href: '#', icon: MousePointer2, label: 'Heatmaps', desc: 'See click patterns' },
        { href: '#', icon: Sparkles, label: 'AI Insights', desc: 'Get recommendations' }
    ];

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
            {/* Demo Banner - Fixed at top */}
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 100,
                background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                padding: '10px var(--space-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-md)'
            }}>
                <Sparkles size={16} />
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                    You&apos;re viewing a demo of the real dashboard. Ready to track your own site?
                </span>
                <Link
                    href="/register"
                    style={{
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: 'white',
                        background: 'rgba(255,255,255,0.2)',
                        padding: '6px 16px',
                        borderRadius: 'var(--radius-full)',
                        textDecoration: 'none'
                    }}
                >
                    Get Started Free <ArrowRight size={14} />
                </Link>
            </div>

            {/* Sidebar - Exact match of real dashboard */}
            <aside style={{
                width: '260px',
                background: 'var(--color-bg-secondary)',
                borderRight: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                position: 'fixed',
                top: '40px',
                left: 0,
                height: 'calc(100vh - 40px)',
                zIndex: 50
            }}>
                {/* Logo */}
                <div style={{
                    padding: 'var(--space-lg)',
                    borderBottom: '1px solid var(--color-border)'
                }}>
                    <Link href="/" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-sm)',
                        textDecoration: 'none',
                        color: 'var(--color-text-primary)'
                    }}>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            background: 'var(--gradient-primary)',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <BarChart3 size={18} color="white" />
                        </div>
                        <span style={{ fontSize: '1.125rem', fontWeight: 700 }}>TrackFlow</span>
                        <span style={{
                            marginLeft: '4px',
                            padding: '2px 8px',
                            background: 'rgba(168, 85, 247, 0.2)',
                            color: '#a855f7',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.6875rem',
                            fontWeight: 600
                        }}>
                            DEMO
                        </span>
                    </Link>
                </div>

                {/* Domain Selector */}
                <div style={{ padding: 'var(--space-md)' }}>
                    <button
                        onClick={() => setDomainDropdownOpen(!domainDropdownOpen)}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-sm)',
                            padding: 'var(--space-sm) var(--space-md)',
                            background: 'var(--color-bg-tertiary)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--color-text-primary)',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                        }}
                    >
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
                            const isActive = 'active' in item && item.active;

                            if (hasChildren) {
                                return (
                                    <div key={i}>
                                        <button
                                            onClick={() => toggleSection(item.label)}
                                            style={{
                                                width: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 'var(--space-sm)',
                                                padding: 'var(--space-sm) var(--space-md)',
                                                background: 'transparent',
                                                border: 'none',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--color-text-secondary)',
                                                cursor: 'pointer',
                                                fontSize: '0.875rem'
                                            }}
                                        >
                                            <Icon size={18} />
                                            <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        </button>
                                        {isExpanded && (
                                            <div style={{ marginLeft: 'var(--space-lg)', marginTop: '2px' }}>
                                                {item.children.map((child, j) => (
                                                    <div
                                                        key={j}
                                                        style={{
                                                            display: 'block',
                                                            padding: 'var(--space-xs) var(--space-md)',
                                                            color: 'var(--color-text-secondary)',
                                                            fontSize: '0.8125rem',
                                                            borderRadius: 'var(--radius-sm)',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {child.label}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={i}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--space-sm)',
                                        padding: 'var(--space-sm) var(--space-md)',
                                        background: isActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                        borderRadius: 'var(--radius-md)',
                                        color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                        fontSize: '0.875rem',
                                        fontWeight: isActive ? 500 : 400,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Icon size={18} />
                                    <span>{item.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </nav>

                {/* User Section */}
                <div style={{
                    padding: 'var(--space-md)',
                    borderTop: '1px solid var(--color-border)'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-sm)',
                        padding: 'var(--space-sm)'
                    }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--gradient-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            fontSize: '0.875rem'
                        }}>
                            DU
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>Demo User</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>Free Plan</div>
                        </div>
                        <Settings size={16} style={{ color: 'var(--color-text-tertiary)', cursor: 'pointer' }} />
                        <button
                            onClick={toggleTheme}
                            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                            style={{
                                padding: 'var(--space-xs)',
                                background: 'var(--color-bg-tertiary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--color-text-tertiary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main style={{
                flex: 1,
                marginLeft: '260px',
                marginTop: '40px',
                padding: 'var(--space-xl)'
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--space-xl)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Dashboard</h1>
                        {/* Real-time indicator */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-sm)',
                            padding: 'var(--space-sm) var(--space-md)',
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            borderRadius: 'var(--radius-md)'
                        }}>
                            <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: 'var(--color-success)',
                                animation: 'pulse 2s infinite'
                            }} />
                            <span style={{ fontSize: '0.875rem' }}>
                                <strong>127</strong> active now
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                        <select
                            value={dateRange}
                            onChange={(e) => setDateRange(e.target.value)}
                            style={{
                                padding: 'var(--space-sm) var(--space-md)',
                                background: 'var(--color-bg-secondary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--color-text-primary)',
                                fontSize: '0.875rem',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="7d">Last 7 days</option>
                            <option value="14d">Last 14 days</option>
                            <option value="30d">Last 30 days</option>
                            <option value="90d">Last 90 days</option>
                        </select>
                    </div>
                </div>

                {/* Stats Cards - Exact match */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 'var(--space-md)',
                    marginBottom: 'var(--space-xl)'
                }}>
                    {statCards.map((stat, i) => {
                        const Icon = stat.icon;
                        return (
                            <div key={i} style={{
                                background: 'var(--color-bg-secondary)',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--color-border)',
                                padding: 'var(--space-lg)',
                                position: 'relative',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    height: '3px',
                                    background: stat.color
                                }} />
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginBottom: 'var(--space-sm)'
                                }}>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                        {stat.label}
                                    </span>
                                    <Icon size={18} style={{ color: stat.color }} />
                                </div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>
                                    {stat.value}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Quick Actions - Exact match */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 'var(--space-md)',
                    marginBottom: 'var(--space-xl)'
                }}>
                    {quickActions.map((action, i) => {
                        const Icon = action.icon;
                        return (
                            <div key={i} style={{
                                background: 'var(--color-bg-secondary)',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--color-border)',
                                padding: 'var(--space-md)',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                                    <div style={{
                                        padding: 'var(--space-sm)',
                                        background: 'var(--color-bg-tertiary)',
                                        borderRadius: 'var(--radius-md)'
                                    }}>
                                        <Icon size={20} style={{ color: 'var(--color-primary)' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 500, marginBottom: '2px' }}>{action.label}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>{action.desc}</div>
                                    </div>
                                    <ArrowRight size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Charts Row - Exact match */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr',
                    gap: 'var(--space-lg)',
                    marginBottom: 'var(--space-xl)'
                }}>
                    {/* Traffic Chart */}
                    <div style={{
                        background: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--color-border)',
                        padding: 'var(--space-lg)'
                    }}>
                        <h4 style={{
                            marginBottom: 'var(--space-md)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-sm)',
                            margin: '0 0 var(--space-md)'
                        }}>
                            <TrendingUp size={18} style={{ color: 'var(--color-primary)' }} />
                            Traffic Overview
                        </h4>
                        <div style={{ height: '280px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={trafficData}>
                                    <XAxis
                                        dataKey="date"
                                        stroke="var(--color-text-muted)"
                                        fontSize={12}
                                        tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{
                                            background: 'var(--color-bg-primary)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: '8px'
                                        }}
                                    />
                                    <Line type="monotone" dataKey="pageviews" stroke="#6366f1" strokeWidth={2} dot={false} name="Pageviews" />
                                    <Line type="monotone" dataKey="visitors" stroke="#a855f7" strokeWidth={2} dot={false} name="Visitors" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Sources Pie Chart */}
                    <div style={{
                        background: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--color-border)',
                        padding: 'var(--space-lg)'
                    }}>
                        <h4 style={{ margin: '0 0 var(--space-md)' }}>Traffic Sources</h4>
                        <div style={{ height: '180px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={sourceData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={70}
                                        dataKey="value"
                                        paddingAngle={2}
                                    >
                                        {sourceData.map((entry, index) => (
                                            <Cell key={index} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
                            {sourceData.map((item, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: item.color }} />
                                    {item.name}: {item.value.toLocaleString()}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Bottom Row - Exact match */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 'var(--space-lg)'
                }}>
                    {/* Top Pages */}
                    <div style={{
                        background: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--color-border)',
                        padding: 'var(--space-lg)'
                    }}>
                        <h4 style={{ margin: '0 0 var(--space-md)' }}>Top Pages</h4>
                        <table style={{ width: '100%' }}>
                            <tbody>
                                {topPages.map((page, i) => (
                                    <tr key={i}>
                                        <td style={{
                                            padding: 'var(--space-sm) 0',
                                            borderBottom: '1px solid var(--color-border)'
                                        }}>
                                            <span style={{ fontSize: '0.875rem' }}>{page.path}</span>
                                        </td>
                                        <td style={{
                                            padding: 'var(--space-sm) 0',
                                            borderBottom: '1px solid var(--color-border)',
                                            textAlign: 'right',
                                            width: '80px'
                                        }}>
                                            <span style={{
                                                padding: '2px 8px',
                                                background: 'var(--color-bg-tertiary)',
                                                borderRadius: 'var(--radius-sm)',
                                                fontSize: '0.75rem'
                                            }}>
                                                {page.views.toLocaleString()}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Real-time Activity */}
                    <div style={{
                        background: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--color-border)',
                        padding: 'var(--space-lg)'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 'var(--space-md)'
                        }}>
                            <h4 style={{ margin: 0 }}>Real-Time Activity</h4>
                            <RefreshCw size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                        </div>
                        <div style={{
                            padding: 'var(--space-lg)',
                            background: 'var(--color-bg-tertiary)',
                            borderRadius: 'var(--radius-md)',
                            marginBottom: 'var(--space-lg)',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--color-success)' }}>
                                127
                            </div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                Active visitors right now
                            </div>
                        </div>
                        <div>
                            <div style={{
                                fontSize: '0.75rem',
                                color: 'var(--color-text-tertiary)',
                                marginBottom: 'var(--space-sm)',
                                textTransform: 'uppercase'
                            }}>
                                Active Pages
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                                {activePages.map((page, i) => (
                                    <div key={i} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <span style={{ fontSize: '0.875rem' }}>{page.path}</span>
                                        <span style={{
                                            padding: '2px 8px',
                                            background: 'var(--color-bg-tertiary)',
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: '0.75rem'
                                        }}>
                                            {page.count}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <style jsx global>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
        </div>
    );
}
