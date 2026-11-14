'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ThemedLogo } from '@/components/ThemedLogo';

/*
 * Landing header: a compact glass bar floating off the top edge.
 * On phones the menu button morphs into a close mark and opens a full height
 * panel whose links arrive one after another. The section in view is marked
 * as current in both. Styles live in styles/glass.css under "Header".
 */

const LINKS = [
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Features', href: '#features' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Demo', href: '/demo' },
];

export default function LandingNav() {
    const [open, setOpen] = useState(false);
    const [current, setCurrent] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Mark the section crossing the middle of the screen as current
    useEffect(() => {
        const els = LINKS.filter(l => l.href.startsWith('#'))
            .map(l => document.getElementById(l.href.slice(1)))
            .filter((el): el is HTMLElement => !!el);
        const inView = new Set<string>();
        const io = new IntersectionObserver(entries => {
            for (const e of entries) {
                if (e.isIntersecting) inView.add(e.target.id);
                else inView.delete(e.target.id);
            }
            const first = els.find(el => inView.has(el.id));
            setCurrent(first ? `#${first.id}` : null);
        }, { rootMargin: '-45% 0px -50% 0px' });
        els.forEach(el => io.observe(el));
        return () => io.disconnect();
    }, []);

    // While open: Escape closes, the page behind stops scrolling
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = prev;
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    // Close if the screen grows past the phone layout
    useEffect(() => {
        const mq = window.matchMedia('(min-width: 768px)');
        const onChange = () => { if (mq.matches) setOpen(false); };
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    // A closed panel is out of the tab order and hidden from screen readers
    useEffect(() => {
        const el = menuRef.current;
        if (!el) return;
        if (open) el.removeAttribute('inert');
        else el.setAttribute('inert', '');
    }, [open]);

    const close = () => setOpen(false);

    return (
        <>
            <header className="lp-bar-wrap">
                <nav className={`lp-bar${open ? ' is-open' : ''}`} aria-label="Main">
                    <Link href="/" className="lp-bar-logo" aria-label="Thravic home" onClick={close}>
                        <ThemedLogo height={24} />
                    </Link>

                    <ul className="lp-bar-links">
                        {LINKS.map(l => (
                            <li key={l.href}>
                                <Link href={l.href} className="lp-bar-link"
                                    aria-current={current === l.href ? 'location' : undefined}>
                                    {l.label}
                                </Link>
                            </li>
                        ))}
                    </ul>

                    <div className="lp-bar-actions">
                        <ThemeToggle />
                        <Link href="/login" className="lp-bar-link lp-bar-login">Log in</Link>
                        <Link href="/register" className="btn-primary lp-bar-cta" onClick={close}>Sign up</Link>
                        <button type="button" className="lp-bar-toggle"
                            aria-expanded={open} aria-controls="lp-menu"
                            aria-label={open ? 'Close menu' : 'Open menu'}
                            onClick={() => setOpen(o => !o)}>
                            <span aria-hidden="true" />
                            <span aria-hidden="true" />
                        </button>
                    </div>
                </nav>
            </header>

            <div id="lp-menu" ref={menuRef} className={`lp-menu${open ? ' is-open' : ''}`} aria-hidden={!open}>
                <ul className="lp-menu-list">
                    {[...LINKS, { label: 'Log in', href: '/login' }].map((l, i) => (
                        <li key={l.href}>
                            <Link href={l.href} className="lp-menu-link" onClick={close}
                                style={{ '--i': i } as React.CSSProperties}
                                aria-current={current === l.href ? 'location' : undefined}>
                                {l.label}
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </>
    );
}
