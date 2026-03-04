'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    Globe,
    TrendingUp,
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
    ChevronLeft,
    Calendar,
    RefreshCw,
    Download,
    Sun,
    Moon,
    PanelLeftClose,
    PanelLeftOpen,
    Menu,
    X
} from 'lucide-react';
import { auth } from '@/lib/api';
import { DomainProvider, useDomain } from '@/contexts/DomainContext';
import { useTheme } from '@/contexts/ThemeContext';
import { DateRangeProvider, useDateRange, datePresets } from '@/contexts/DateRangeContext';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';

const navStructure = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Overview', exact: true },
    {
        label: 'Traffic', icon: Globe,
        children: [
            { href: '/dashboard/traffic/sources', label: 'Sources' },
            { href: '/dashboard/traffic/campaigns', label: 'Campaigns' },
            { href: '/dashboard/traffic/trends', label: 'Trends' }
        ]
    },
    {
        label: 'Behavior', icon: Users,
        children: [
            { href: '/dashboard/behavior/pages', label: 'Pages' },
            { href: '/dashboard/behavior/paths', label: 'Paths' },
            { href: '/dashboard/behavior/devices', label: 'Devices' }
        ]
    },
    { href: '/dashboard/funnels', icon: Target, label: 'Funnels' },
    { href: '/dashboard/heatmaps', icon: MousePointer2, label: 'Heatmaps' },
    { href: '/dashboard/sessions', icon: Video, label: 'Sessions' },
    { href: '/dashboard/insights', icon: Sparkles, label: 'AI Insights' },
    { href: '/dashboard/reports', icon: FileBarChart, label: 'Reports' },
];

interface NavItemProps {
    item: any;
    pathname: string;
    expandedSections: string[];
    toggleSection: (label: string) => void;
    collapsed: boolean;
}

function NavItem({ item, pathname, expandedSections, toggleSection, collapsed }: NavItemProps) {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedSections.includes(item.label);
    const isActive = item.href
        ? (item.exact ? pathname === item.href : pathname.startsWith(item.href))
        : item.children?.some((child: any) => pathname.startsWith(child.href));

    const Icon = item.icon;

    const baseItemStyle: React.CSSProperties = {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? '0' : '10px',
        padding: collapsed ? '10px 0' : '8px 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        background: isActive ? 'var(--color-bg-hover)' : 'transparent',
        border: 'none',
        borderLeft: isActive && !collapsed ? '2px solid var(--color-accent-primary)' : collapsed ? 'none' : '2px solid transparent',
        borderRadius: collapsed ? '8px' : '0 6px 6px 0',
        color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        cursor: 'pointer',
        fontSize: '0.875rem',
        fontWeight: isActive ? 600 : 400,
        textDecoration: 'none',
        transition: 'all 150ms ease',
        position: 'relative',
        textAlign: 'left' as const,
        whiteSpace: 'nowrap' as const,
        overflow: 'hidden',
    };

    if (hasChildren) {
        return (
            <div>
                <button
                    onClick={() => toggleSection(item.label)}
                    style={baseItemStyle}
                    title={collapsed ? item.label : undefined}
                >
                    <Icon size={18} style={{ flexShrink: 0 }} />
                    {!collapsed && (
                        <>
                            <span style={{ flex: 1 }}>{item.label}</span>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </>
                    )}
                </button>
                {isExpanded && !collapsed && (
                    <div style={{ marginLeft: '15px', marginTop: '2px' }}>
                        {item.children.map((child: any) => {
                            const childActive = pathname === child.href;
                            return (
                                <Link
                                    key={child.href}
                                    href={child.href}
                                    style={{
                                        display: 'block',
                                        padding: '6px 12px 6px 28px',
                                        color: childActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                        fontSize: '0.8125rem',
                                        fontWeight: childActive ? 500 : 400,
                                        textDecoration: 'none',
                                        borderRadius: '4px',
                                        background: childActive ? 'var(--color-bg-hover)' : 'transparent',
                                        transition: 'all 150ms ease',
                                    }}
                                >
                                    {child.label}
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    return (
        <Link href={item.href} style={baseItemStyle} title={collapsed ? item.label : undefined}>
            <Icon size={18} style={{ flexShrink: 0 }} />
            {!collapsed && <span>{item.label}</span>}
        </Link>
    );
}

function ThemeToggleButton() {
    const { theme, toggleTheme } = useTheme();
    return (
        <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            style={{
                padding: '6px',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
    );
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [user, setUser] = useState<{ name: string; email: string; subscription: string } | null>(null);
    const [domainDropdownOpen, setDomainDropdownOpen] = useState(false);
    const [expandedSections, setExpandedSections] = useState<string[]>(['Traffic', 'Behavior']);
    const { domains: domainList, selectedDomainId: selectedDomain, setSelectedDomainId: setSelectedDomain } = useDomain();
    const { dateRange, setDateRange, comparisonEnabled, toggleComparison } = useDateRange();
    const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
    const [realTimeEnabled, setRealTimeEnabled] = useState(false);

    const [isMobile, setIsMobile] = useState(false);

    // Detect mobile — must be in useEffect to avoid SSR mismatch
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 1024);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // On mobile: sidebar is always 240px overlay, collapse state is ignored
    // On desktop: sidebar collapses to 56px or expands to 240px
    const sidebarVisualWidth = isMobile ? 240 : (sidebarCollapsed ? 56 : 240);
    const mainMarginLeft = isMobile ? 0 : (sidebarCollapsed ? 56 : 240);

    // Persist collapse state (desktop only)
    useEffect(() => {
        const saved = localStorage.getItem('tf_sidebar_collapsed');
        if (saved === 'true') setSidebarCollapsed(true);
    }, []);

    const toggleSidebar = () => {
        if (isMobile) {
            // On mobile: hamburger toggles overlay
            setMobileSidebarOpen(prev => !prev);
        } else {
            // On desktop: collapse/expand
            const next = !sidebarCollapsed;
            setSidebarCollapsed(next);
            localStorage.setItem('tf_sidebar_collapsed', String(next));
        }
    };

    useEffect(() => {
        if (!auth.isAuthenticated()) {
            router.push('/login');
            return;
        }
        auth.getMe().then(result => {
            if (result.data) setUser(result.data);
        });
    }, []);

    // ── Refresh data when user returns to the tab ──────────────────────────
    // Next.js App Router caches route segments and client state. When a user leaves and comes
    // back, the page doesn't re-fetch. This fixes that by incrementing a key that forces
    // a remount of the main content area, triggering all useEffect data fetches again.
    const [refreshKey, setRefreshKey] = useState(0);
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                router.refresh();
                setRefreshKey(prev => prev + 1);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [router]);

    const handleLogout = async () => {
        await auth.logout();
        router.push('/login');
    };

    const toggleSection = (label: string) => {
        setExpandedSections(prev =>
            prev.includes(label) ? prev.filter(s => s !== label) : [...prev, label]
        );
    };

    const currentDomain = domainList.find(d => d.id === selectedDomain);
    const currentDatePreset = datePresets.find(p => p.value === dateRange);

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg-primary)' }}>

            {/* ── Sidebar ── */}
            <aside
                className={`dash-sidebar${mobileSidebarOpen ? ' mobile-open' : ''}`}
                style={{ width: `${sidebarVisualWidth}px` }}
            >
                {/* Logo + Collapse toggle */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: (sidebarCollapsed && !isMobile) ? 'center' : 'space-between',
                    padding: (sidebarCollapsed && !isMobile) ? '16px 0' : '0 12px 0 16px',
                    height: '56px',
                    borderBottom: '1px solid var(--color-sidebar-border)',
                    flexShrink: 0,
                }}>
                    {(!sidebarCollapsed || isMobile) && (
                        <Link href="/dashboard" style={{
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
                            <span style={{ fontWeight: 700, fontSize: '1rem', whiteSpace: 'nowrap' }}>TrackFlow</span>
                        </Link>
                    )}
                    {sidebarCollapsed && !isMobile && (
                        <div style={{
                            width: '28px', height: '28px', background: 'var(--color-accent-primary)',
                            borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <TrendingUp size={15} color="white" />
                        </div>
                    )}
                    <button
                        onClick={toggleSidebar}
                        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        style={{
                            padding: '4px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--color-text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: '4px',
                            flexShrink: 0,
                            marginLeft: sidebarCollapsed ? '0' : 'auto',
                        }}
                    >
                        {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                    </button>
                </div>

                {/* Domain Selector */}
                {!sidebarCollapsed && (
                    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-sidebar-border)', flexShrink: 0 }}>
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setDomainDropdownOpen(!domainDropdownOpen)}
                                style={{
                                    width: '100%', display: 'flex', alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '7px 10px',
                                    background: 'var(--color-bg-primary)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '6px', cursor: 'pointer',
                                    fontSize: '0.8125rem', color: 'var(--color-text-primary)',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Globe size={13} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                                        {currentDomain?.domain || 'Select domain'}
                                    </span>
                                </div>
                                <ChevronDown size={12} />
                            </button>
                            {domainDropdownOpen && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0,
                                    marginTop: '4px', background: 'var(--color-bg-card)',
                                    border: '1px solid var(--color-border)', borderRadius: '6px',
                                    boxShadow: 'var(--shadow-md)', zIndex: 100, maxHeight: '200px', overflow: 'auto',
                                }}>
                                    {domainList.map(domain => (
                                        <button
                                            key={domain.id}
                                            onClick={() => { setSelectedDomain(domain.id); setDomainDropdownOpen(false); }}
                                            style={{
                                                width: '100%', padding: '8px 12px',
                                                background: selectedDomain === domain.id ? 'var(--color-bg-hover)' : 'transparent',
                                                border: 'none', textAlign: 'left', cursor: 'pointer',
                                                fontSize: '0.8125rem', color: selectedDomain === domain.id ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
                                            }}
                                        >{domain.domain}</button>
                                    ))}
                                    <Link
                                        href="/dashboard/domains/new"
                                        onClick={() => setDomainDropdownOpen(false)}
                                        style={{
                                            display: 'block', padding: '8px 12px',
                                            borderTop: '1px solid var(--color-border)',
                                            color: 'var(--color-accent-primary)', fontSize: '0.8125rem',
                                        }}
                                    >+ Add Domain</Link>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Navigation */}
                <nav style={{
                    flex: 1, overflowY: 'auto', overflowX: 'hidden',
                    padding: (sidebarCollapsed && !isMobile) ? '8px 4px' : '8px 0',
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {navStructure.map((item, idx) => (
                            <NavItem
                                key={idx}
                                item={item}
                                pathname={pathname}
                                expandedSections={expandedSections}
                                toggleSection={toggleSection}
                                collapsed={sidebarCollapsed && !isMobile}
                            />
                        ))}
                    </div>
                </nav>

                {/* Bottom — Settings + User */}
                <div style={{
                    borderTop: '1px solid var(--color-sidebar-border)',
                    padding: (sidebarCollapsed && !isMobile) ? '8px 4px' : '8px 0',
                    flexShrink: 0,
                }}>
                    {/* Settings link */}
                    <Link
                        href="/dashboard/settings"
                        title={(sidebarCollapsed && !isMobile) ? 'Settings' : undefined}
                        style={{
                            display: 'flex', alignItems: 'center',
                            gap: (sidebarCollapsed && !isMobile) ? '0' : '10px',
                            padding: (sidebarCollapsed && !isMobile) ? '10px 0' : '8px 12px',
                            justifyContent: (sidebarCollapsed && !isMobile) ? 'center' : 'flex-start',
                            color: pathname.startsWith('/dashboard/settings') ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                            textDecoration: 'none', fontSize: '0.875rem',
                            background: pathname.startsWith('/dashboard/settings') ? 'var(--color-bg-hover)' : 'transparent',
                            borderLeft: !(sidebarCollapsed && !isMobile) && pathname.startsWith('/dashboard/settings') ? '3px solid var(--color-accent-primary)' : !(sidebarCollapsed && !isMobile) ? '3px solid transparent' : 'none',
                            whiteSpace: 'nowrap', overflow: 'hidden',
                        }}
                    >
                        <Settings size={18} style={{ flexShrink: 0 }} />
                        {!(sidebarCollapsed && !isMobile) && <span>Settings</span>}
                    </Link>

                    {/* User row */}
                    {user && (
                        <div style={{
                            display: 'flex', alignItems: 'center',
                            gap: (sidebarCollapsed && !isMobile) ? '0' : '8px',
                            padding: (sidebarCollapsed && !isMobile) ? '8px 0' : '8px 12px',
                            justifyContent: (sidebarCollapsed && !isMobile) ? 'center' : 'flex-start',
                            marginTop: '4px',
                        }}>
                            <div style={{
                                width: '28px', height: '28px', borderRadius: '50%',
                                background: 'var(--color-accent-primary)', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', color: 'white',
                                fontWeight: 700, fontSize: '0.75rem', flexShrink: 0,
                            }}>
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                            {!(sidebarCollapsed && !isMobile) && (
                                <>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: '0.8125rem', fontWeight: 500,
                                            color: 'var(--color-text-primary)',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>{user.name}</div>
                                        <div style={{
                                            fontSize: '0.6875rem', color: 'var(--color-text-muted)',
                                            textTransform: 'capitalize',
                                        }}>{user.subscription} Plan</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <ThemeToggleButton />
                                        <button
                                            onClick={handleLogout}
                                            title="Logout"
                                            style={{
                                                padding: '6px', background: 'transparent',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: '6px', color: 'var(--color-text-muted)',
                                                cursor: 'pointer', display: 'flex',
                                            }}
                                        ><LogOut size={15} /></button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </aside>

            {/* ── Main Content ── */}
            <main
                className="dash-main"
                style={{ marginLeft: `${mainMarginLeft}px` }}
            >
                <ImpersonationBanner />
                <AnnouncementBanner />

                {/* Top Header */}
                <header style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0 16px', height: '52px',
                    background: 'var(--color-bg-card)',
                    borderBottom: '1px solid var(--color-border)',
                    position: 'sticky', top: 0, zIndex: 40,
                    gap: '8px',
                }}>
                    {/* Left: hamburger (mobile) + date controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                        {/* Mobile hamburger */}
                        <button
                            className="dash-hamburger"
                            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
                            title="Toggle menu"
                        >
                            <Menu size={18} />
                        </button>

                        {/* Date Range — always visible */}
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
                                    boxShadow: 'var(--shadow-md)', zIndex: 100, minWidth: '150px',
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

                        {/* Compare — desktop only */}
                        <button
                            className="desktop-only"
                            onClick={toggleComparison}
                            style={{
                                alignItems: 'center', gap: '6px',
                                padding: '5px 10px',
                                background: comparisonEnabled ? 'var(--color-bg-hover)' : 'var(--color-bg-primary)',
                                border: `1px solid ${comparisonEnabled ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                                borderRadius: '6px', cursor: 'pointer',
                                fontSize: '0.8125rem',
                                color: comparisonEnabled ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                            }}
                        >
                            <TrendingUp size={13} />
                            <span>Compare</span>
                        </button>
                    </div>

                    {/* Right: actions — Live and Export desktop only, theme always */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        {/* Live — desktop only */}
                        <button
                            className="desktop-only"
                            onClick={() => setRealTimeEnabled(!realTimeEnabled)}
                            style={{
                                alignItems: 'center', gap: '6px',
                                padding: '5px 10px',
                                background: realTimeEnabled ? 'rgba(16,185,129,0.1)' : 'var(--color-bg-primary)',
                                border: `1px solid ${realTimeEnabled ? '#10b981' : 'var(--color-border)'}`,
                                borderRadius: '6px', cursor: 'pointer',
                                fontSize: '0.8125rem',
                                color: realTimeEnabled ? '#10b981' : 'var(--color-text-secondary)',
                            }}
                        >
                            <RefreshCw size={13} className={realTimeEnabled ? 'animate-spin' : ''} />
                            <span>Live</span>
                        </button>

                        {/* Export — desktop only */}
                        <button
                            className="desktop-only"
                            style={{
                                alignItems: 'center', gap: '6px',
                                padding: '5px 10px',
                                background: 'var(--color-bg-primary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '6px', cursor: 'pointer',
                                fontSize: '0.8125rem', color: 'var(--color-text-secondary)',
                            }}
                        >
                            <Download size={13} />
                            <span>Export</span>
                        </button>

                        {/* Theme toggle — always visible */}
                        <ThemeToggleButton />
                    </div>
                </header>

                {/* Page Content */}
                <div key={refreshKey} className="dash-content">
                    {children}
                </div>
            </main>

            {/* Mobile overlay backdrop */}
            <div
                className={`dash-overlay${mobileSidebarOpen ? ' active' : ''}`}
                onClick={() => setMobileSidebarOpen(false)}
            />
        </div>
    );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <DomainProvider>
            <DateRangeProvider>
                <DashboardLayoutInner>{children}</DashboardLayoutInner>
            </DateRangeProvider>
        </DomainProvider>
    );
}
