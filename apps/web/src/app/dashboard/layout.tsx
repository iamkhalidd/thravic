'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ThemedLogo } from '@/components/ThemedLogo';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    Globe,
    TrendingUp,
    Megaphone,
    FileText,
    Route,
    MonitorSmartphone,
    UsersRound,
    Webhook,
    SlidersHorizontal,
    Target,
    MousePointer2,
    Video,
    Sparkles,
    FileBarChart,
    Settings,
    LogOut,
    ChevronDown,
    ChevronLeft,
    Calendar,
    RefreshCw,
    Download,
    PanelLeftClose,
    PanelLeftOpen,
    Menu,
    X,
    AlertTriangle,
    Gauge,
    FileInput,
    MousePointerClick,
    Smartphone
} from 'lucide-react';
import { isApp, pathFits } from '@/lib/platform';
import { useToast } from '@/components/Toast';
import type { Domain } from '@/types';
import { auth } from '@/lib/api';
import { DomainProvider, useDomain } from '@/contexts/DomainContext';
import { DateRangeProvider, useDateRange, datePresets } from '@/contexts/DateRangeContext';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { BillingBanner } from '@/components/BillingBanner';
import { UsageWidget } from '@/components/UsageWidget';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { ThemeToggle } from '@/components/ThemeToggle';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';

// Pages that read useApiRange().compare; elsewhere the Compare button would do nothing
const COMPARE_PAGES = ['/dashboard', '/dashboard/traffic/trends', '/dashboard/traffic/sources', '/dashboard/behavior/pages'];

type NavEntry = {
    href?: string; label: string; appLabel?: string; icon?: any; exact?: boolean;
    children?: NavEntry[];
};

// Sections that are always open, so every page is one click away. The first
// section has no heading.
const navStructure: NavEntry[] = [
    {
        label: '',
        children: [
            { href: '/dashboard', icon: LayoutDashboard, label: 'Overview', exact: true },
            { href: '/dashboard/insights', icon: Sparkles, label: 'AI insights' },
            { href: '/dashboard/reports', icon: FileBarChart, label: 'Reports' },
        ],
    },
    {
        label: 'Traffic',
        children: [
            { href: '/dashboard/traffic/sources', icon: Globe, label: 'Sources' },
            { href: '/dashboard/traffic/campaigns', icon: Megaphone, label: 'Campaigns' },
            { href: '/dashboard/traffic/trends', icon: TrendingUp, label: 'Trends' },
        ],
    },
    {
        label: 'Activity',
        children: [
            { href: '/dashboard/behavior/pages', icon: FileText, label: 'Pages', appLabel: 'Screens' },
            { href: '/dashboard/behavior/paths', icon: Route, label: 'Page flow', appLabel: 'Screen flow' },
            { href: '/dashboard/funnels', icon: Target, label: 'Funnels' },
            { href: '/dashboard/behavior/devices', icon: MonitorSmartphone, label: 'Devices' },
            { href: '/dashboard/behavior/versions', icon: Smartphone, label: 'App versions' },
        ],
    },
    {
        label: 'Recordings',
        children: [
            { href: '/dashboard/sessions', icon: Video, label: 'Session recordings' },
            { href: '/dashboard/heatmaps', icon: MousePointer2, label: 'Heatmaps' },
            { href: '/dashboard/rage-clicks', icon: MousePointerClick, label: 'Rage clicks' },
            { href: '/dashboard/forms', icon: FileInput, label: 'Forms' },
        ],
    },
    {
        label: 'Problems',
        children: [
            { href: '/dashboard/errors', icon: AlertTriangle, label: 'Errors' },
            { href: '/dashboard/performance', icon: Gauge, label: 'Page speed' },
        ],
    },
];

/**
 * The sidebar for one kind of property. An app keeps the same sections, minus the
 * pages it has nothing for (a group left empty goes too) and with app wording.
 */
function navFor(app: boolean): NavEntry[] {
    const fit = (items: NavEntry[]): NavEntry[] => items.flatMap(item => {
        if (item.children) {
            const children = fit(item.children);
            return children.length ? [{ ...item, children }] : [];
        }
        if (item.href && !pathFits(item.href, app)) return [];
        return [{ ...item, label: app && item.appLabel ? item.appLabel : item.label }];
    });
    return fit(navStructure);
}

/** The switcher's list, as [heading, properties] groups. Headings only once there's an app. */
function switcherGroups(list: Domain[]): Array<[string | null, Domain[]]> {
    const apps = list.filter(d => isApp(d));
    if (apps.length === 0) return [[null, list]];
    const sites = list.filter(d => !isApp(d));
    return [['Websites', sites], ['Apps', apps]].filter(([, items]) => items.length > 0) as Array<[string, Domain[]]>;
}
interface NavItemProps {
    item: NavEntry;
    pathname: string;
    collapsed: boolean;
}

function NavItem({ item, pathname, collapsed }: NavItemProps) {
    const href = item.href!;
    const isActive = item.exact ? pathname === href : pathname.startsWith(href);
    const Icon = item.icon;

    return (
        <Link
            href={href}
            className={`dash-nav-item${isActive ? ' is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            title={collapsed ? item.label : undefined}
            style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: collapsed ? '0' : '10px',
                padding: collapsed ? '8px 0' : '7px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: 'transparent',
                borderRadius: '6px',
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                fontSize: '0.8125rem',
                fontWeight: isActive ? 500 : 400,
                textDecoration: 'none',
                transition: 'all 150ms ease',
                position: 'relative',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
            }}
        >
            <Icon size={18} style={{ flexShrink: 0 }} />
            {!collapsed && <span>{item.label}</span>}
        </Link>
    );
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [user, setUser] = useState<{ name: string; email: string; subscription: string; avatar_url?: string } | null>(null);
    const [domainDropdownOpen, setDomainDropdownOpen] = useState(false);
    const { domains: domainList, selectedDomainId: selectedDomain, setSelectedDomainId: setSelectedDomain, selectedDomain: currentProperty } = useDomain();
    const { toast } = useToast();
    const appSelected = isApp(currentProperty);
    const nav = navFor(appSelected);

    // Switching to an app while on a website-only page (or back): go to the overview
    // rather than show an empty page.
    useEffect(() => {
        if (!currentProperty || pathFits(pathname, appSelected)) return;
        router.replace('/dashboard');
        toast('info', appSelected
            ? 'That page needs a website, so here is the overview of your app.'
            : 'That page is for apps, so here is the overview of your site.');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname, currentProperty?.id, appSelected]);
    const { dateRange, setDateRange, comparisonEnabled, toggleComparison, live, setLive, streaming } = useDateRange();
    const [dateDropdownOpen, setDateDropdownOpen] = useState(false);

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
            if (!result.data) return;
            // Dashboard data needs a complete profile (the API refuses it otherwise).
            if (!result.data.profile_complete || result.data.restricted) {
                router.replace('/complete-profile');
                return;
            }
            setUser(result.data);
        });
    }, []);

    const handleLogout = async () => {
        await auth.logout();
        router.push('/login');
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
                            <ThemedLogo height={22} />
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
                                    {appSelected ? <Smartphone size={13} aria-label="App" /> : <Globe size={13} aria-label="Website" />}
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                                        {(appSelected && currentDomain?.name) || currentDomain?.domain || 'Select property'}
                                    </span>
                                    {currentDomain?.paused && (
                                        <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>Paused</span>
                                    )}
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
                                    {switcherGroups(domainList).map(([heading, items]) => (
                                        <div key={heading ?? 'all'} role="group" aria-label={heading ?? undefined}>
                                            {heading && (
                                                <div style={{
                                                    padding: '8px 12px 4px', fontSize: '0.6875rem', fontWeight: 500,
                                                    textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)',
                                                }}>{heading}</div>
                                            )}
                                            {items.map(domain => {
                                                const app = isApp(domain);
                                                const Icon = app ? Smartphone : Globe;
                                                return (
                                                    <button
                                                        key={domain.id}
                                                        onClick={() => { setSelectedDomain(domain.id); setDomainDropdownOpen(false); }}
                                                        title={app ? domain.domain : undefined}
                                                        style={{
                                                            width: '100%', padding: '8px 12px',
                                                            display: 'flex', alignItems: 'center', gap: '6px',
                                                            background: selectedDomain === domain.id ? 'var(--color-bg-hover)' : 'transparent',
                                                            border: 'none', textAlign: 'left', cursor: 'pointer',
                                                            fontSize: '0.8125rem', color: selectedDomain === domain.id ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
                                                        }}
                                                    >
                                                        <Icon size={13} style={{ flexShrink: 0, color: 'var(--color-text-muted)' }} aria-hidden="true" />
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {(app && domain.name) || domain.domain}
                                                        </span>
                                                        {domain.paused && (
                                                            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Paused</span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ))}
                                    <Link
                                        href="/dashboard/domains/new"
                                        onClick={() => setDomainDropdownOpen(false)}
                                        style={{
                                            display: 'block', padding: '8px 12px',
                                            borderTop: '1px solid var(--color-border)',
                                            color: 'var(--color-accent-primary)', fontSize: '0.8125rem',
                                        }}
                                    >+ Add website or app</Link>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Navigation */}
                <nav className="no-scrollbar" style={{
                    flex: 1, overflowY: 'auto', overflowX: 'hidden',
                    padding: (sidebarCollapsed && !isMobile) ? '8px 4px' : '8px 0',
                }}>
                    {nav.map(section => (
                        <div
                            key={section.label || 'main'}
                            role="group"
                            aria-label={section.label || undefined}
                            style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: section.label ? 14 : 0 }}
                        >
                            {section.label && ((sidebarCollapsed && !isMobile) ? (
                                <div aria-hidden="true" style={{ height: 1, margin: '0 8px 4px', background: 'var(--color-sidebar-border)' }} />
                            ) : (
                                <div style={{
                                    padding: '0 12px 4px', fontSize: '0.6875rem', fontWeight: 500,
                                    textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)',
                                }}>{section.label}</div>
                            ))}
                            {section.children!.map(item => (
                                <NavItem
                                    key={item.href}
                                    item={item}
                                    pathname={pathname}
                                    collapsed={sidebarCollapsed && !isMobile}
                                />
                            ))}
                        </div>
                    ))}
                </nav>

                {/* Bottom — Settings + User */}
                <div style={{
                    borderTop: '1px solid var(--color-sidebar-border)',
                    padding: (sidebarCollapsed && !isMobile) ? '8px 4px' : '8px 0',
                    flexShrink: 0,
                }}>
                    {/* Webhooks link */}
                    <Link
                        href="/dashboard/webhooks"
                        title={(sidebarCollapsed && !isMobile) ? 'Webhooks' : undefined}
                        style={{
                            display: 'flex', alignItems: 'center',
                            gap: (sidebarCollapsed && !isMobile) ? '0' : '10px',
                            padding: (sidebarCollapsed && !isMobile) ? '10px 0' : '8px 12px',
                            justifyContent: (sidebarCollapsed && !isMobile) ? 'center' : 'flex-start',
                            color: pathname.startsWith('/dashboard/webhooks') ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            fontWeight: pathname.startsWith('/dashboard/webhooks') ? 500 : 400,
                            textDecoration: 'none', fontSize: '0.8125rem',
                            background: 'transparent',
                            whiteSpace: 'nowrap', overflow: 'hidden',
                        }}
                    >
                        <Webhook size={18} style={{ flexShrink: 0 }} />
                        {!(sidebarCollapsed && !isMobile) && <span>Webhooks</span>}
                    </Link>

                    {/* Tracking link */}
                    <Link
                        href="/dashboard/tracking"
                        title={(sidebarCollapsed && !isMobile) ? 'Site settings' : undefined}
                        style={{
                            display: 'flex', alignItems: 'center',
                            gap: (sidebarCollapsed && !isMobile) ? '0' : '10px',
                            padding: (sidebarCollapsed && !isMobile) ? '10px 0' : '8px 12px',
                            justifyContent: (sidebarCollapsed && !isMobile) ? 'center' : 'flex-start',
                            color: pathname.startsWith('/dashboard/tracking') ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            fontWeight: pathname.startsWith('/dashboard/tracking') ? 500 : 400,
                            textDecoration: 'none', fontSize: '0.8125rem',
                            background: 'transparent',
                            whiteSpace: 'nowrap', overflow: 'hidden',
                        }}
                    >
                        <SlidersHorizontal size={18} style={{ flexShrink: 0 }} />
                        {!(sidebarCollapsed && !isMobile) && <span>Site settings</span>}
                    </Link>

                    {/* Team link */}
                    <Link
                        href="/dashboard/team"
                        title={(sidebarCollapsed && !isMobile) ? 'Team' : undefined}
                        style={{
                            display: 'flex', alignItems: 'center',
                            gap: (sidebarCollapsed && !isMobile) ? '0' : '10px',
                            padding: (sidebarCollapsed && !isMobile) ? '10px 0' : '8px 12px',
                            justifyContent: (sidebarCollapsed && !isMobile) ? 'center' : 'flex-start',
                            color: pathname.startsWith('/dashboard/team') ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            fontWeight: pathname.startsWith('/dashboard/team') ? 500 : 400,
                            textDecoration: 'none', fontSize: '0.8125rem',
                            background: 'transparent',
                            whiteSpace: 'nowrap', overflow: 'hidden',
                        }}
                    >
                        <UsersRound size={18} style={{ flexShrink: 0 }} />
                        {!(sidebarCollapsed && !isMobile) && <span>Team</span>}
                    </Link>

                    {/* Settings link */}
                    <Link
                        href="/dashboard/settings"
                        title={(sidebarCollapsed && !isMobile) ? 'Account' : undefined}
                        style={{
                            display: 'flex', alignItems: 'center',
                            gap: (sidebarCollapsed && !isMobile) ? '0' : '10px',
                            padding: (sidebarCollapsed && !isMobile) ? '10px 0' : '8px 12px',
                            justifyContent: (sidebarCollapsed && !isMobile) ? 'center' : 'flex-start',
                            color: pathname.startsWith('/dashboard/settings') ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            fontWeight: pathname.startsWith('/dashboard/settings') ? 500 : 400,
                            textDecoration: 'none', fontSize: '0.8125rem',
                            background: 'transparent',
                            whiteSpace: 'nowrap', overflow: 'hidden',
                        }}
                    >
                        <Settings size={18} style={{ flexShrink: 0 }} />
                        {!(sidebarCollapsed && !isMobile) && <span>Account</span>}
                    </Link>

                    {!(sidebarCollapsed && !isMobile) && <UsageWidget />}

                    {/* User row */}
                    {user && (
                        <div style={{
                            display: 'flex', alignItems: 'center',
                            gap: (sidebarCollapsed && !isMobile) ? '0' : '8px',
                            padding: (sidebarCollapsed && !isMobile) ? '8px 0' : '8px 12px',
                            justifyContent: (sidebarCollapsed && !isMobile) ? 'center' : 'flex-start',
                            marginTop: '4px',
                        }}>
                            <img
                                src={user.avatar_url?.startsWith('/uploads') ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${user.avatar_url}` : user.avatar_url}
                                alt={user.name}
                                style={{
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    objectFit: 'cover', flexShrink: 0, border: '1px solid var(--color-border)'
                                }}
                            />
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
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>{user.email}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px' }}>
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
                <BillingBanner />

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

                        {/* Compare — desktop only, and only where a page shows the previous period */}
                        {COMPARE_PAGES.includes(pathname) && <button
                            className="desktop-only"
                            onClick={toggleComparison}
                            aria-pressed={comparisonEnabled}
                            title="Compare with the previous period of the same length"
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
                        </button>}
                    </div>

                    {/* Right: actions — Live and Export desktop only, theme always */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <ThemeToggle />
                        
                        {/* Live — desktop only; on, the open page re-fetches as the API pushes new events */}
                        <button
                            className="desktop-only"
                            onClick={() => setLive(!live)}
                            aria-pressed={live}
                            title={!live ? 'Live paused. Click to show new data as it arrives.' : streaming ? 'Live: new data shows up as it arrives. Click to pause.' : 'Live: connecting, checking every 30 seconds meanwhile. Click to pause.'}
                            style={{
                                alignItems: 'center', gap: '6px',
                                padding: '5px 10px',
                                background: live ? 'rgba(16,185,129,0.1)' : 'var(--color-bg-primary)',
                                border: `1px solid ${live ? '#10b981' : 'var(--color-border)'}`,
                                borderRadius: '6px', cursor: 'pointer',
                                fontSize: '0.8125rem',
                                color: live ? '#10b981' : 'var(--color-text-secondary)',
                            }}
                        >
                            <RefreshCw size={13} />
                            <span>Live</span>
                        </button>

                        {/* Export — desktop only; the downloads live on the Reports page */}
                        <Link
                            href="/dashboard/reports"
                            className="desktop-only"
                            style={{
                                alignItems: 'center', gap: '6px',
                                padding: '5px 10px',
                                background: 'var(--color-bg-primary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '6px', cursor: 'pointer',
                                fontSize: '0.8125rem', color: 'var(--color-text-secondary)',
                                textDecoration: 'none',
                            }}
                        >
                            <Download size={13} />
                            <span>Export</span>
                        </Link>
                    </div>
                </header>

                {/* Page Content */}
                <div className="dash-content">
                    {/* Per page, so a broken page keeps the sidebar and other pages working. */}
                    <RouteErrorBoundary>{children}</RouteErrorBoundary>
                </div>
            </main>

            {/* Mobile overlay backdrop */}
            <div
                className={`dash-sidebar-overlay${mobileSidebarOpen ? ' active' : ''}`}
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
