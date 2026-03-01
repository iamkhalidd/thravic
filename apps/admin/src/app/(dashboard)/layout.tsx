'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAccessToken, clearTokens } from '@/lib/api';
import {
    LayoutDashboard, Users, Globe, CreditCard, Activity,
    Server, FileText, Settings, Database, Menu,
    LogOut, Shield, X
} from 'lucide-react';

const navItems = [
    {
        section: 'Overview', items: [
            { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
        ]
    },
    {
        section: 'Management', items: [
            { href: '/users', icon: Users, label: 'Users' },
            { href: '/domains', icon: Globe, label: 'Domains' },
            { href: '/subscriptions', icon: CreditCard, label: 'Subscriptions' },
            { href: '/events', icon: Activity, label: 'Events' },
        ]
    },
    {
        section: 'System', items: [
            { href: '/system', icon: Server, label: 'System Health' },
            { href: '/audit', icon: FileText, label: 'Audit Log' },
            { href: '/settings', icon: Settings, label: 'Settings' },
            { href: '/retention', icon: Database, label: 'Data Retention' },
        ]
    },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) {
            router.push('/login');
            return;
        }
        setMounted(true);
    }, [router]);

    // Close sidebar when route changes (mobile nav)
    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    if (!mounted) {
        return (
            <div className="loading" style={{ minHeight: '100vh' }}>
                <div className="spinner" />
            </div>
        );
    }

    const currentPage = navItems
        .flatMap(s => s.items)
        .find(item => item.href === pathname);

    const handleLogout = () => {
        clearTokens();
        router.push('/login');
    };

    return (
        <div className="admin-layout">
            {/* Dark overlay — closes sidebar on mobile tap */}
            <div
                className={`admin-overlay${sidebarOpen ? ' active' : ''}`}
                onClick={() => setSidebarOpen(false)}
            />

            {/* Sidebar */}
            <aside className={`admin-sidebar${sidebarOpen ? ' open' : ''}`}>
                <div className="sidebar-header">
                    <Shield size={22} color="var(--color-accent)" />
                    <span className="sidebar-logo">TrackFlow</span>
                    <span className="sidebar-badge">Admin</span>
                    {/* Close button — mobile only */}
                    <button
                        className="admin-hamburger"
                        onClick={() => setSidebarOpen(false)}
                        title="Close menu"
                        style={{ marginLeft: 'auto' }}
                    >
                        <X size={18} />
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map((section) => (
                        <div key={section.section} className="sidebar-section">
                            <div className="sidebar-section-title">{section.section}</div>
                            {section.items.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`sidebar-link ${pathname === item.href ? 'active' : ''}`}
                                >
                                    <item.icon size={18} />
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <button
                        onClick={handleLogout}
                        className="sidebar-link"
                        style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                        <LogOut size={18} />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="admin-main">
                <div className="admin-topbar">
                    {/* Hamburger — visible on mobile only */}
                    <button
                        className="admin-hamburger"
                        onClick={() => setSidebarOpen(true)}
                        title="Open menu"
                    >
                        <Menu size={20} />
                    </button>
                    <h1>{currentPage?.label || 'Admin'}</h1>
                </div>
                <div className="admin-content">
                    {children}
                </div>
            </main>
        </div>
    );
}
