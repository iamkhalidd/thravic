'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, signOut } from '@/lib/api';
import { ThemedLogo } from '@/components/ThemedLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
    LayoutDashboard, Users, Globe, CreditCard, Activity,
    Server, FileText, Settings, Database, Menu,
    LogOut, X, Layers, Tag, Mail, Wallet, TrendingUp, type LucideIcon,
} from 'lucide-react';

interface NavItem {
    href: string;
    icon: LucideIcon;
    label: string;
    description: string;
}

const navSections: { label: string; items: NavItem[] }[] = [
    {
        label: '', items: [
            { href: '/', icon: LayoutDashboard, label: 'Overview', description: 'What needs your attention, and how Thravic is growing.' },
            { href: '/revenue', icon: Wallet, label: 'Revenue', description: 'MRR and what is behind it, money received, and the monthly check against Paystack.' },
            { href: '/growth', icon: TrendingUp, label: 'Growth', description: 'Where new accounts drop off, who stopped paying, and who is stuck.' },
        ]
    },
    {
        label: 'Customers', items: [
            { href: '/users', icon: Users, label: 'Users', description: 'Everyone with an account. Change plans, suspend or reset access.' },
            { href: '/domains', icon: Globe, label: 'Domains', description: 'Every site and app sending data, with its owner and volume.' },
            { href: '/subscriptions', icon: CreditCard, label: 'Subscriptions', description: 'Paid plans, renewals and accounts in their grace period.' },
        ]
    },
    {
        label: 'Billing', items: [
            { href: '/plans', icon: Layers, label: 'Plans & pricing', description: 'What each plan costs and what it includes.' },
            { href: '/promos', icon: Tag, label: 'Promo codes', description: 'Discount codes, their limits and how often they were used.' },
        ]
    },
    {
        label: 'Messages', items: [
            { href: '/product-updates', icon: Mail, label: 'Product updates', description: 'Email news about Thravic to users who opted in.' },
        ]
    },
    {
        label: 'Platform', items: [
            { href: '/settings', icon: Settings, label: 'Settings', description: 'Sign-ups, tracking, maintenance, blocking and the site-wide announcement.' },
            { href: '/retention', icon: Database, label: 'Data retention', description: 'How long each plan keeps its data.' },
            { href: '/system', icon: Server, label: 'System health', description: 'The API server, database and cache.' },
            { href: '/audit', icon: FileText, label: 'Audit log', description: 'Every admin action, who did it and when.' },
            { href: '/events', icon: Activity, label: 'Raw events', description: 'The latest events as they arrive, for debugging.' },
        ]
    },
];

// Signed out after this long without a click, key press or scroll. The API
// ends the session on its side too (the refresh token expires after 30 idle minutes).
const IDLE_MINUTES = 30;

function useIdleSignOut(enabled: boolean) {
    const lastActive = useRef(Date.now());
    useEffect(() => {
        if (!enabled) return;
        const touch = () => { lastActive.current = Date.now(); };
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
        events.forEach(e => window.addEventListener(e, touch, { passive: true }));
        const timer = window.setInterval(() => {
            if (Date.now() - lastActive.current > IDLE_MINUTES * 60_000) signOut('idle');
        }, 30_000);
        return () => {
            events.forEach(e => window.removeEventListener(e, touch));
            window.clearInterval(timer);
        };
    }, [enabled]);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loadError, setLoadError] = useState('');

    // The session lives in httpOnly cookies the page cannot read, so ask the API.
    // A 401 sends the browser to /login (see lib/api.ts).
    useEffect(() => {
        api.get('/api/admin/me').then(() => setMounted(true)).catch((err: Error) => setLoadError(err.message));
    }, []);

    useIdleSignOut(mounted);

    // Close sidebar when route changes (mobile nav)
    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    if (!mounted) {
        return (
            <div className="loading" style={{ minHeight: '100vh', flexDirection: 'column', gap: 12 }}>
                {loadError ? (
                    <>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>{loadError}</p>
                        <button className="btn btn-secondary" onClick={() => window.location.reload()}>Try again</button>
                    </>
                ) : <div className="spinner" />}
            </div>
        );
    }

    const currentPage = navSections.flatMap(s => s.items).find(item => item.href === pathname);
    const currentSection = navSections.find(s => s.items.includes(currentPage as NavItem))?.label;

    const handleLogout = () => signOut();

    return (
        <div className="admin-layout">
            {/* Closes the sidebar on a mobile tap outside it */}
            <div
                className={`admin-overlay${sidebarOpen ? ' active' : ''}`}
                onClick={() => setSidebarOpen(false)}
            />

            <aside className={`admin-sidebar${sidebarOpen ? ' open' : ''}`}>
                <div className="sidebar-header">
                    <Link href="/" aria-label="Admin overview" style={{ display: 'inline-flex' }}>
                        <ThemedLogo height={20} />
                    </Link>
                    <span className="sidebar-badge">Admin</span>
                    <button
                        className="icon-btn admin-hamburger"
                        onClick={() => setSidebarOpen(false)}
                        title="Close menu"
                        aria-label="Close menu"
                        style={{ marginLeft: 'auto' }}
                    >
                        <X size={16} />
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {navSections.map((section) => (
                        <div key={section.label || 'main'} className="sidebar-section" role="group" aria-label={section.label || undefined}>
                            {section.label && <div className="sidebar-section-title">{section.label}</div>}
                            {section.items.map((item) => {
                                const active = pathname === item.href;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`sidebar-link${active ? ' active' : ''}`}
                                        aria-current={active ? 'page' : undefined}
                                    >
                                        <item.icon size={18} />
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </div>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <button
                        onClick={handleLogout}
                        className="sidebar-link"
                        style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer' }}
                    >
                        <LogOut size={18} />
                        Sign out
                    </button>
                </div>
            </aside>

            <main className="admin-main">
                <header className="admin-topbar">
                    <button
                        className="icon-btn admin-hamburger"
                        onClick={() => setSidebarOpen(true)}
                        title="Open menu"
                        aria-label="Open menu"
                    >
                        <Menu size={16} />
                    </button>
                    <div className="topbar-crumb">
                        {currentSection ? <>{currentSection} / </> : null}
                        <strong>{currentPage?.label || 'Admin'}</strong>
                    </div>
                    <ThemeToggle />
                </header>
                <div className="admin-content">
                    {currentPage && (
                        <div className="page-header">
                            <div>
                                <h1 className="page-title">{currentPage.label}</h1>
                                <p className="page-subtitle">{currentPage.description}</p>
                            </div>
                        </div>
                    )}
                    {children}
                </div>
            </main>
        </div>
    );
}
