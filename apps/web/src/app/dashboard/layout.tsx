'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    Globe,
    TrendingUp,
    Megaphone,
    Users,
    FileText,
    Smartphone,
    Target,
    MousePointer2,
    Video,
    Sparkles,
    FileBarChart,
    Settings,
    LogOut,
    Menu,
    X,
    ChevronDown,
    ChevronRight,
    Calendar,
    RefreshCw,
    Download,
    Clock,
    Sun,
    Moon
} from 'lucide-react';
import { auth, domains } from '@/lib/api';
import { DomainProvider, useDomain } from '@/contexts/DomainContext';
import { useTheme } from '@/contexts/ThemeContext';
import { DateRangeProvider, useDateRange, datePresets } from '@/contexts/DateRangeContext';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';

// Hierarchical navigation structure per spec
const navStructure = [
    {
        href: '/dashboard',
        icon: LayoutDashboard,
        label: 'Overview',
        exact: true
    },
    {
        label: 'Traffic',
        icon: Globe,
        children: [
            { href: '/dashboard/traffic/sources', label: 'Sources' },
            { href: '/dashboard/traffic/campaigns', label: 'Campaigns' },
            { href: '/dashboard/traffic/trends', label: 'Trends' }
        ]
    },
    {
        label: 'Behavior',
        icon: Users,
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
}

function NavItem({ item, pathname, expandedSections, toggleSection }: NavItemProps) {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedSections.includes(item.label);
    const isActive = item.href
        ? (item.exact ? pathname === item.href : pathname.startsWith(item.href))
        : item.children?.some((child: any) => pathname.startsWith(child.href));

    const Icon = item.icon;

    if (hasChildren) {
        return (
            <div>
                <button
                    onClick={() => toggleSection(item.label)}
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-sm)',
                        padding: 'var(--space-sm) var(--space-md)',
                        background: isActive ? 'var(--color-primary-alpha)' : 'transparent',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: isActive ? 500 : 400,
                        transition: 'all var(--transition-fast)'
                    }}
                >
                    <Icon size={18} />
                    <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {isExpanded && (
                    <div style={{ marginLeft: 'var(--space-lg)', marginTop: '2px' }}>
                        {item.children.map((child: any) => (
                            <Link
                                key={child.href}
                                href={child.href}
                                style={{
                                    display: 'block',
                                    padding: 'var(--space-xs) var(--space-md)',
                                    color: pathname === child.href ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                    fontSize: '0.8125rem',
                                    textDecoration: 'none',
                                    borderRadius: 'var(--radius-sm)',
                                    background: pathname === child.href ? 'var(--color-primary-alpha)' : 'transparent',
                                    transition: 'all var(--transition-fast)'
                                }}
                            >
                                {child.label}
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <Link
            href={item.href}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
                padding: 'var(--space-sm) var(--space-md)',
                background: isActive ? 'var(--color-primary-alpha)' : 'transparent',
                borderRadius: 'var(--radius-md)',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: isActive ? 500 : 400,
                transition: 'all var(--transition-fast)'
            }}
        >
            <Icon size={18} />
            <span>{item.label}</span>
        </Link>
    );
}

// Theme Toggle Button Component
function ThemeToggleButton() {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
                padding: 'var(--space-sm)',
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all var(--transition-fast)'
            }}
        >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
    );
}

// Inner layout that uses domain context
function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [user, setUser] = useState<{ name: string; email: string; subscription: string } | null>(null);
    const [domainDropdownOpen, setDomainDropdownOpen] = useState(false);
    const [expandedSections, setExpandedSections] = useState<string[]>(['Traffic', 'Behavior']);

    // Use domain context instead of local state
    const { domains: domainList, selectedDomainId: selectedDomain, setSelectedDomainId: setSelectedDomain } = useDomain();

    // Use shared date range context
    const { dateRange, setDateRange, comparisonEnabled, toggleComparison } = useDateRange();
    const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
    const [realTimeEnabled, setRealTimeEnabled] = useState(false);

    useEffect(() => {
        // Check auth
        if (!auth.isAuthenticated()) {
            router.push('/login');
            return;
        }

        // Load user
        auth.getMe().then(result => {
            if (result.data) {
                setUser(result.data);
            }
        });
    }, []);

    const handleLogout = async () => {
        await auth.logout();
        router.push('/login');
    };

    const toggleSection = (label: string) => {
        setExpandedSections(prev =>
            prev.includes(label)
                ? prev.filter(s => s !== label)
                : [...prev, label]
        );
    };

    const currentDomain = domainList.find(d => d.id === selectedDomain);
    const currentDatePreset = datePresets.find(p => p.value === dateRange);

    return (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
            {/* Sidebar */}
            <aside style={{
                width: '260px',
                background: 'var(--color-bg-secondary)',
                borderRight: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                position: 'fixed',
                top: 0,
                left: 0,
                height: '100vh',
                zIndex: 50,
                transition: 'transform var(--transition-normal)',
                transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'
            }} className="sidebar">
                {/* Logo */}
                <div style={{
                    padding: 'var(--space-lg)',
                    borderBottom: '1px solid var(--color-border)'
                }}>
                    <Link href="/dashboard" style={{
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
                            <TrendingUp size={18} color="white" />
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '1.125rem' }}>TrackFlow</span>
                    </Link>
                </div>

                {/* Domain Selector */}
                <div style={{ padding: 'var(--space-md)', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setDomainDropdownOpen(!domainDropdownOpen)}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: 'var(--space-sm) var(--space-md)',
                                background: 'var(--color-bg-tertiary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                color: 'var(--color-text-primary)'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                                <Globe size={14} />
                                <span>{currentDomain?.domain || 'Select domain'}</span>
                            </div>
                            <ChevronDown size={14} />
                        </button>

                        {domainDropdownOpen && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                marginTop: '4px',
                                background: 'var(--color-bg-secondary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                boxShadow: 'var(--shadow-lg)',
                                zIndex: 100,
                                maxHeight: '200px',
                                overflow: 'auto'
                            }}>
                                {domainList.map(domain => (
                                    <button
                                        key={domain.id}
                                        onClick={() => {
                                            setSelectedDomain(domain.id);
                                            setDomainDropdownOpen(false);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: 'var(--space-sm) var(--space-md)',
                                            background: selectedDomain === domain.id ? 'var(--color-primary-alpha)' : 'transparent',
                                            border: 'none',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            fontSize: '0.875rem',
                                            color: 'var(--color-text-primary)'
                                        }}
                                    >
                                        {domain.domain}
                                    </button>
                                ))}
                                <Link
                                    href="/dashboard/domains/new"
                                    style={{
                                        display: 'block',
                                        padding: 'var(--space-sm) var(--space-md)',
                                        borderTop: '1px solid var(--color-border)',
                                        color: 'var(--color-primary)',
                                        fontSize: '0.875rem',
                                        textDecoration: 'none'
                                    }}
                                    onClick={() => setDomainDropdownOpen(false)}
                                >
                                    + Add Domain
                                </Link>
                            </div>
                        )}
                    </div>
                </div>

                {/* Navigation */}
                <nav style={{ flex: 1, padding: 'var(--space-md)', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {navStructure.map((item, idx) => (
                            <NavItem
                                key={idx}
                                item={item}
                                pathname={pathname}
                                expandedSections={expandedSections}
                                toggleSection={toggleSection}
                            />
                        ))}
                    </div>
                </nav>

                {/* Settings & User */}
                <div style={{
                    padding: 'var(--space-md)',
                    borderTop: '1px solid var(--color-border)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
                        <Link
                            href="/dashboard/settings"
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-sm)',
                                padding: 'var(--space-sm) var(--space-md)',
                                color: pathname.startsWith('/dashboard/settings') ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                textDecoration: 'none',
                                fontSize: '0.875rem',
                                borderRadius: 'var(--radius-md)'
                            }}
                        >
                            <Settings size={18} />
                            <span>Settings</span>
                        </Link>
                        <ThemeToggleButton />
                    </div>

                    {user && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-sm)',
                            padding: 'var(--space-sm) var(--space-md)',
                            marginTop: 'var(--space-sm)'
                        }}>
                            <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: 'var(--gradient-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontWeight: 600,
                                fontSize: '0.75rem'
                            }}>
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: '0.8125rem',
                                    fontWeight: 500,
                                    color: 'var(--color-text-primary)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}>{user.name}</div>
                                <div style={{
                                    fontSize: '0.6875rem',
                                    color: 'var(--color-text-tertiary)',
                                    textTransform: 'capitalize'
                                }}>{user.subscription} Plan</div>
                            </div>
                            <button
                                onClick={handleLogout}
                                title="Logout"
                                style={{
                                    padding: 'var(--space-xs)',
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--color-text-tertiary)',
                                    cursor: 'pointer',
                                    borderRadius: 'var(--radius-sm)'
                                }}
                            >
                                <LogOut size={16} />
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Content */}
            <main style={{
                flex: 1,
                marginLeft: '260px',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '100vh'
            }} className="main-content">
                {/* System banners — shown above everything else */}
                <ImpersonationBanner />
                <AnnouncementBanner />

                {/* Global Controls Bar */}
                <header style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-md) var(--space-lg)',
                    background: 'var(--color-bg-secondary)',
                    borderBottom: '1px solid var(--color-border)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 40
                }}>
                    {/* Mobile menu button */}
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        style={{
                            display: 'none',
                            padding: 'var(--space-sm)',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--color-text-primary)'
                        }}
                        className="mobile-menu-btn"
                    >
                        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>

                    {/* Left side controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                        {/* Date Range Picker */}
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-xs)',
                                    padding: 'var(--space-xs) var(--space-sm)',
                                    background: 'var(--color-bg-tertiary)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    fontSize: '0.8125rem',
                                    color: 'var(--color-text-primary)'
                                }}
                            >
                                <Calendar size={14} />
                                <span>{currentDatePreset?.label || 'Select date'}</span>
                                <ChevronDown size={12} />
                            </button>

                            {dateDropdownOpen && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    marginTop: '4px',
                                    background: 'var(--color-bg-secondary)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-md)',
                                    boxShadow: 'var(--shadow-lg)',
                                    zIndex: 100,
                                    minWidth: '150px'
                                }}>
                                    {datePresets.map(preset => (
                                        <button
                                            key={preset.value}
                                            onClick={() => {
                                                setDateRange(preset.value);
                                                setDateDropdownOpen(false);
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: 'var(--space-sm) var(--space-md)',
                                                background: dateRange === preset.value ? 'var(--color-primary-alpha)' : 'transparent',
                                                border: 'none',
                                                textAlign: 'left',
                                                cursor: 'pointer',
                                                fontSize: '0.8125rem',
                                                color: dateRange === preset.value ? 'var(--color-primary)' : 'var(--color-text-primary)'
                                            }}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Comparison Toggle */}
                        <button
                            onClick={toggleComparison}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-xs)',
                                padding: 'var(--space-xs) var(--space-sm)',
                                background: comparisonEnabled ? 'var(--color-primary-alpha)' : 'var(--color-bg-tertiary)',
                                border: '1px solid',
                                borderColor: comparisonEnabled ? 'var(--color-primary)' : 'var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                fontSize: '0.8125rem',
                                color: comparisonEnabled ? 'var(--color-primary)' : 'var(--color-text-secondary)'
                            }}
                        >
                            <TrendingUp size={14} />
                            <span>Compare</span>
                        </button>
                    </div>

                    {/* Right side controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                        {/* Real-time Toggle */}
                        <button
                            onClick={() => setRealTimeEnabled(!realTimeEnabled)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-xs)',
                                padding: 'var(--space-xs) var(--space-sm)',
                                background: realTimeEnabled ? 'var(--color-success-alpha, rgba(34, 197, 94, 0.1))' : 'var(--color-bg-tertiary)',
                                border: '1px solid',
                                borderColor: realTimeEnabled ? 'var(--color-success, #22c55e)' : 'var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                fontSize: '0.8125rem',
                                color: realTimeEnabled ? 'var(--color-success, #22c55e)' : 'var(--color-text-secondary)'
                            }}
                        >
                            <RefreshCw size={14} className={realTimeEnabled ? 'animate-spin' : ''} />
                            <span>Live</span>
                        </button>

                        {/* Export Button */}
                        <button
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-xs)',
                                padding: 'var(--space-xs) var(--space-sm)',
                                background: 'var(--color-bg-tertiary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                fontSize: '0.8125rem',
                                color: 'var(--color-text-secondary)'
                            }}
                        >
                            <Download size={14} />
                            <span>Export</span>
                        </button>
                    </div>
                </header>

                {/* Page Content */}
                <div style={{ flex: 1, padding: 'var(--space-lg)' }}>
                    {children}
                </div>
            </main>

            {/* Overlay for mobile */}
            {sidebarOpen && (
                <div
                    onClick={() => setSidebarOpen(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.5)',
                        zIndex: 40
                    }}
                    className="sidebar-overlay"
                />
            )}

            <style jsx global>{`
                @media (min-width: 1024px) {
                    .sidebar {
                        transform: translateX(0) !important;
                    }
                    .mobile-menu-btn {
                        display: none !important;
                    }
                    .sidebar-overlay {
                        display: none !important;
                    }
                }
                @media (max-width: 1023px) {
                    .main-content {
                        margin-left: 0 !important;
                    }
                    .mobile-menu-btn {
                        display: block !important;
                    }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin {
                    animation: spin 2s linear infinite;
                }
            `}</style>
        </div>
    );
}

// Main layout wrapper with DomainProvider and DateRangeProvider
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <DomainProvider>
            <DateRangeProvider>
                <DashboardLayoutInner>{children}</DashboardLayoutInner>
            </DateRangeProvider>
        </DomainProvider>
    );
}
