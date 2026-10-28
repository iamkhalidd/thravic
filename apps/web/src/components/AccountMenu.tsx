'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronsUpDown, LogOut, Settings, CreditCard } from 'lucide-react';
import { payments } from '@/lib/api';
import { meterTone, percent, timeUntil, TONE_COLORS, type UsageMeter } from '@/lib/usage';

const REFRESH_MS = 5 * 60_000;
const MENU_WIDTH = 240;

interface AccountMenuProps {
    user: { name: string; email: string; subscription: string; avatar_url?: string };
    collapsed: boolean;
    active: boolean;
    onLogout: () => void;
}

function avatarSrc(url?: string) {
    return url?.startsWith('/uploads') ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${url}` : url;
}

/**
 * Sidebar footer: one row for the signed-in user that opens a menu with the
 * plan, the event allowance, account settings and sign out. The allowance
 * only shows in the sidebar itself once it is running low.
 */
export function AccountMenu({ user, collapsed, active, onLogout }: AccountMenuProps) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ left: number; bottom: number }>({ left: 0, bottom: 0 });
    const [planName, setPlanName] = useState<string | null>(null);
    const [events, setEvents] = useState<UsageMeter | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        const load = () => {
            payments.getCurrent().then(({ data }) => {
                if (!cancelled && data?.subscription) {
                    setPlanName(data.subscription.planName || data.subscription.plan);
                }
            });
            payments.getUsage().then(({ data }) => {
                const meter = data?.usage?.meters?.find(m => m.key === 'events');
                if (!cancelled && meter) setEvents(meter);
            });
        };
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => { cancelled = true; clearInterval(timer); };
    }, []);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
        };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const toggle = () => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (rect) {
            // Above the row when expanded; beside the avatar when the sidebar is collapsed
            setPos(collapsed
                ? { left: rect.right + 8, bottom: window.innerHeight - rect.bottom }
                : { left: rect.left, bottom: window.innerHeight - rect.top + 6 });
        }
        setOpen(o => !o);
    };

    const tone = events ? meterTone(events.used, events.limit) : 'ok';
    const used = events ? percent(events.used, events.limit) : 0;
    const plan = planName ?? (user.subscription ? user.subscription[0].toUpperCase() + user.subscription.slice(1) : '');

    const meter = events && (
        <div style={{ height: '4px', background: 'var(--color-bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${used}%`, height: '100%', background: TONE_COLORS[tone] }} />
        </div>
    );

    const itemStyle: React.CSSProperties = {
        display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
        padding: '7px 10px', borderRadius: '6px', fontSize: '0.8125rem',
        color: 'var(--color-text-secondary)', textDecoration: 'none',
        background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
    };

    return (
        <div style={{ borderTop: '1px solid var(--color-border)', padding: collapsed ? '8px 0' : '8px' }}>
            {/* Running low: keep the allowance in sight without opening the menu */}
            {!collapsed && tone !== 'ok' && events && (
                <Link
                    href="/dashboard/settings?tab=subscription"
                    style={{ display: 'block', padding: '4px 8px 8px', textDecoration: 'none', fontSize: '0.75rem' }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                            {tone === 'over' ? 'Event limit reached' : 'Events running low'}
                        </span>
                        <span style={{ color: TONE_COLORS[tone] }}>{used}%</span>
                    </div>
                    {meter}
                </Link>
            )}

            <button
                ref={buttonRef}
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                title={collapsed ? user.name : undefined}
                className="dash-nav-item"
                style={{
                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                    padding: collapsed ? '4px 0' : '6px 8px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    background: open || active ? 'var(--color-bg-tertiary)' : 'transparent',
                    border: 'none', borderRadius: '6px', cursor: 'pointer', textAlign: 'left',
                }}
            >
                <img
                    src={avatarSrc(user.avatar_url)}
                    alt=""
                    style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        objectFit: 'cover', flexShrink: 0, border: '1px solid var(--color-border)',
                    }}
                />
                {!collapsed && (
                    <>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-primary)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>{user.name}</div>
                            <div style={{
                                fontSize: '0.6875rem', color: 'var(--color-text-muted)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>{plan ? `${plan} plan` : user.email}</div>
                        </div>
                        <ChevronsUpDown size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                    </>
                )}
            </button>

            {open && (
                <div
                    ref={menuRef}
                    role="menu"
                    style={{
                        position: 'fixed', left: pos.left, bottom: pos.bottom, zIndex: 1000,
                        width: MENU_WIDTH, padding: '6px',
                        background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
                        borderRadius: '8px', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
                    }}
                >
                    <div style={{ padding: '6px 10px 8px' }}>
                        <div style={{
                            fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-primary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{user.name}</div>
                        <div style={{
                            fontSize: '0.75rem', color: 'var(--color-text-muted)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{user.email}</div>
                    </div>

                    {events && (
                        <Link
                            href="/dashboard/settings?tab=subscription"
                            role="menuitem"
                            onClick={() => setOpen(false)}
                            className="dash-nav-item"
                            style={{ ...itemStyle, display: 'block', fontSize: '0.75rem' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{plan} plan</span>
                                <span style={{ color: TONE_COLORS[tone] }}>{used}%</span>
                            </div>
                            {meter}
                            <div style={{ marginTop: '6px', color: 'var(--color-text-muted)' }}>
                                {events.used.toLocaleString()} of {events.limit?.toLocaleString()} events
                                {events.resetsAt && <> · resets {timeUntil(events.resetsAt)}</>}
                            </div>
                        </Link>
                    )}

                    <div style={{ height: '1px', background: 'var(--color-border)', margin: '6px 0' }} />

                    <Link href="/dashboard/settings" role="menuitem" onClick={() => setOpen(false)} className="dash-nav-item" style={itemStyle}>
                        <Settings size={15} /> Account settings
                    </Link>
                    <Link href="/dashboard/settings?tab=subscription" role="menuitem" onClick={() => setOpen(false)} className="dash-nav-item" style={itemStyle}>
                        <CreditCard size={15} /> Plan and billing
                    </Link>

                    <div style={{ height: '1px', background: 'var(--color-border)', margin: '6px 0' }} />

                    <button role="menuitem" onClick={() => { setOpen(false); onLogout(); }} className="dash-nav-item" style={itemStyle}>
                        <LogOut size={15} /> Log out
                    </button>
                </div>
            )}
        </div>
    );
}
