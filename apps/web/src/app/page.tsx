'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
    BarChart3, Target, MousePointer2, Video, Sparkles, Globe,
    ArrowRight, Check, Sun, Moon, Lock
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

/* ─── DATA ─── */

const features = [
    {
        icon: BarChart3,
        title: 'Traffic Analytics',
        desc: 'Real-time pageviews, sessions, and source attribution with full UTM support.',
    },
    {
        icon: Target,
        title: 'Conversion Funnels',
        desc: 'Build multi-step funnels and see exactly where users drop off.',
    },
    {
        icon: MousePointer2,
        title: 'Heatmaps',
        desc: 'Visualize clicks and scroll depth on every page of your site.',
    },
    {
        icon: Video,
        title: 'Session Recordings',
        desc: 'Watch privacy-safe replays to understand exactly what users do.',
    },
    {
        icon: Sparkles,
        title: 'AI Insights',
        desc: 'Automatic anomaly detection and actionable recommendations.',
    },
    {
        icon: Globe,
        title: 'Multi-Domain',
        desc: 'Manage all your websites from a single unified dashboard.',
    },
];

const pricingTiers = [
    {
        name: 'Hobby', price: 'Free', description: 'For personal projects',
        features: ['1 website', '5k events/month', 'Core analytics & UTM', '30-day retention'],
        cta: 'Get Started', highlighted: false
    },
    {
        name: 'Pro', price: '$29', period: '/mo', description: 'For startups & businesses',
        features: ['3 websites', '100k events/month', 'Heatmaps & recordings', 'Funnels & AI insights', 'CSV export & team', '1-year retention'],
        cta: 'Get Started', highlighted: true
    },
    {
        name: 'Agency', price: '$79', period: '/mo', description: 'For agencies & scale',
        features: ['20 websites', '500k events/month', 'Everything in Pro', 'Unlimited team members', '2-year retention', 'Priority support'],
        cta: 'Get Started', highlighted: false
    }
];

/* ─── STYLES ─── */

const s = {
    page: { minHeight: '100vh', background: 'var(--color-bg-primary)' } as React.CSSProperties,
    container: { maxWidth: '1080px', margin: '0 auto', padding: '0 24px' } as React.CSSProperties,

    // Nav
    nav: {
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: 'var(--color-bg-primary)',
        borderBottom: '1px solid var(--color-border)',
    } as React.CSSProperties,
    navInner: {
        maxWidth: '1080px', margin: '0 auto', padding: '0 24px',
        height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    } as React.CSSProperties,

    // Hero
    hero: {
        paddingTop: '160px', paddingBottom: '120px',
        textAlign: 'center',
    } as React.CSSProperties,
    h1: {
        fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
        fontWeight: 600,
        letterSpacing: '-0.03em',
        lineHeight: 1.1,
        marginBottom: '24px',
    } as React.CSSProperties,
    heroSub: {
        fontSize: 'clamp(1rem, 2vw, 1.25rem)',
        color: 'var(--color-text-secondary)',
        maxWidth: '540px',
        margin: '0 auto 40px',
        lineHeight: 1.6,
    } as React.CSSProperties,
    ctaRow: {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
        flexWrap: 'wrap',
    } as React.CSSProperties,

    // Buttons
    btnPrimary: {
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        padding: '12px 28px', background: 'var(--color-accent-primary)',
        color: '#fff', borderRadius: 'var(--radius-md)',
        fontSize: '0.9375rem', fontWeight: 500, textDecoration: 'none',
        transition: 'opacity var(--transition-fast)',
    } as React.CSSProperties,
    btnSecondary: {
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        padding: '12px 28px', background: 'transparent',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-primary)', borderRadius: 'var(--radius-md)',
        fontSize: '0.9375rem', fontWeight: 500, textDecoration: 'none',
        transition: 'border-color var(--transition-fast)',
    } as React.CSSProperties,

    // Section headers
    sectionLabel: {
        fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-accent-primary)',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px',
    } as React.CSSProperties,
    sectionTitle: {
        fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', fontWeight: 600,
        letterSpacing: '-0.02em', marginBottom: '16px',
    } as React.CSSProperties,
    sectionSub: {
        fontSize: '1.0625rem', color: 'var(--color-text-secondary)',
        maxWidth: '480px', margin: '0 auto', lineHeight: 1.6,
    } as React.CSSProperties,
};

/* ─── COMPONENT ─── */

export default function HomePage() {
    const { theme, toggleTheme } = useTheme();

    return (
        <div style={s.page}>
            {/* ═══ NAV ═══ */}
            <nav style={s.nav}>
                <div style={s.navInner}>
                    <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: 'var(--color-text-primary)' }}>
                        <div style={{
                            width: '28px', height: '28px', borderRadius: '7px',
                            background: 'var(--color-accent-primary)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            <BarChart3 size={16} color="white" />
                        </div>
                        <span style={{ fontSize: '1rem', fontWeight: 600 }}>TrackFlow</span>
                    </Link>

                    <div className="lp-nav-links">
                        {[
                            { label: 'Features', href: '#features' },
                            { label: 'Pricing', href: '#pricing' },
                            { label: 'Demo', href: '/demo' },
                        ].map(link => (
                            <Link key={link.label} href={link.href} style={{
                                color: 'var(--color-text-secondary)', textDecoration: 'none',
                                fontSize: '0.875rem', fontWeight: 450,
                            }}>{link.label}</Link>
                        ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={toggleTheme} aria-label="Toggle theme"
                            style={{
                                padding: '6px', background: 'none', border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)', color: 'var(--color-text-muted)',
                                cursor: 'pointer', display: 'flex', alignItems: 'center',
                            }}>
                            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                        </button>
                        <Link href="/login" style={{
                            padding: '6px 14px', color: 'var(--color-text-secondary)',
                            textDecoration: 'none', fontSize: '0.875rem', fontWeight: 450,
                        }}>Log in</Link>
                        <Link href="/register" className="desktop-only" style={{
                            padding: '7px 18px', background: 'var(--color-accent-primary)',
                            color: 'white', textDecoration: 'none', borderRadius: 'var(--radius-md)',
                            fontSize: '0.8125rem', fontWeight: 500,
                        }}>Get Started</Link>
                    </div>
                </div>
            </nav>

            {/* ═══ HERO ═══ */}
            <section style={s.hero}>
                <div style={s.container}>
                    <h1 style={s.h1}>Understand your users.</h1>
                    <p style={s.heroSub}>
                        Traffic analytics, heatmaps, and session recordings — in one lightweight script.
                    </p>
                    <div style={s.ctaRow}>
                        <Link href="/register" style={s.btnPrimary}>
                            Get Started Free <ArrowRight size={16} />
                        </Link>
                        <Link href="/demo" style={s.btnSecondary}>
                            Live Demo
                        </Link>
                    </div>
                    <p style={{
                        fontSize: '0.8125rem', color: 'var(--color-text-muted)',
                        marginTop: '20px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    }}>
                        <Lock size={12} /> No credit card required
                    </p>
                </div>
            </section>

            {/* ═══ FEATURES ═══ */}
            <section id="features" style={{ padding: 'var(--space-3xl) 0' }}>
                <div style={s.container}>
                    <div style={{ textAlign: 'center', marginBottom: '64px' }}>
                        <p style={s.sectionLabel}>Features</p>
                        <h2 style={s.sectionTitle}>Everything you need to grow</h2>
                        <p style={s.sectionSub}>
                            One script replaces your entire analytics stack.
                        </p>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '1px',
                        background: 'var(--color-border)',
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden',
                        border: '1px solid var(--color-border)',
                    }}>
                        {features.map((f, i) => {
                            const Icon = f.icon;
                            return (
                                <div key={i} style={{
                                    background: 'var(--color-bg-card)',
                                    padding: '40px 32px',
                                }}>
                                    <Icon size={20} style={{ color: 'var(--color-text-muted)', marginBottom: '16px' }} />
                                    <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '8px' }}>
                                        {f.title}
                                    </h3>
                                    <p style={{
                                        fontSize: '0.875rem', color: 'var(--color-text-secondary)',
                                        lineHeight: 1.6, margin: 0,
                                    }}>
                                        {f.desc}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ═══ PRICING ═══ */}
            <section id="pricing" style={{
                padding: 'var(--space-3xl) 0',
                background: 'var(--color-bg-secondary)',
            }}>
                <div style={s.container}>
                    <div style={{ textAlign: 'center', marginBottom: '56px' }}>
                        <p style={s.sectionLabel}>Pricing</p>
                        <h2 style={s.sectionTitle}>Simple, transparent pricing</h2>
                        <p style={s.sectionSub}>Start free, upgrade when you&apos;re ready.</p>
                    </div>

                    <div className="lp-grid-3" style={{ maxWidth: '960px', margin: '0 auto' }}>
                        {pricingTiers.map((tier, i) => (
                            <div key={i} style={{
                                background: 'var(--color-bg-card)',
                                borderRadius: 'var(--radius-lg)',
                                border: tier.highlighted
                                    ? '1px solid var(--color-accent-primary)'
                                    : '1px solid var(--color-border)',
                                padding: '36px 28px',
                                position: 'relative',
                            }}>
                                {tier.highlighted && (
                                    <div style={{
                                        position: 'absolute', top: '-11px', left: '50%', transform: 'translateX(-50%)',
                                        background: 'var(--color-accent-primary)', padding: '3px 14px',
                                        borderRadius: 'var(--radius-full)', fontSize: '0.6875rem',
                                        fontWeight: 500, color: 'white', letterSpacing: '0.02em',
                                    }}>Most Popular</div>
                                )}
                                <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px' }}>{tier.name}</h4>
                                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
                                    {tier.description}
                                </p>
                                <div style={{ marginBottom: '24px' }}>
                                    <span style={{ fontSize: '2.5rem', fontWeight: 600, letterSpacing: '-0.02em' }}>
                                        {tier.price}
                                    </span>
                                    {tier.period && (
                                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                                            {tier.period}
                                        </span>
                                    )}
                                </div>
                                <ul style={{
                                    listStyle: 'none', padding: 0, marginBottom: '28px',
                                    display: 'flex', flexDirection: 'column', gap: '10px',
                                }}>
                                    {tier.features.map((feature, idx) => (
                                        <li key={idx} style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            fontSize: '0.8125rem', color: 'var(--color-text-secondary)',
                                        }}>
                                            <Check size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                                            {feature}
                                        </li>
                                    ))}
                                </ul>
                                <Link href="/register" style={{
                                    display: 'block', textAlign: 'center', padding: '10px 20px',
                                    background: tier.highlighted ? 'var(--color-accent-primary)' : 'transparent',
                                    border: tier.highlighted ? 'none' : '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-md)',
                                    color: tier.highlighted ? 'white' : 'var(--color-text-primary)',
                                    textDecoration: 'none', fontWeight: 500, fontSize: '0.8125rem',
                                    transition: 'opacity var(--transition-fast)',
                                }}>{tier.cta}</Link>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══ CTA ═══ */}
            <section style={{ padding: 'var(--space-3xl) 0' }}>
                <div style={{ ...s.container, textAlign: 'center' as const }}>
                    <h2 style={s.sectionTitle}>Ready to get started?</h2>
                    <p style={{ ...s.sectionSub, marginBottom: '32px' }}>
                        Add one script and start understanding your users today.
                    </p>
                    <Link href="/register" style={s.btnPrimary}>
                        Get Started Free <ArrowRight size={16} />
                    </Link>
                </div>
            </section>

            {/* ═══ FOOTER ═══ */}
            <footer style={{
                padding: '48px 0 32px',
                borderTop: '1px solid var(--color-border)',
            }}>
                <div style={s.container}>
                    <div className="lp-grid-footer" style={{ marginBottom: '40px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <div style={{
                                    width: '24px', height: '24px', borderRadius: '6px',
                                    background: 'var(--color-accent-primary)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <BarChart3 size={14} color="white" />
                                </div>
                                <span style={{ fontSize: '0.9375rem', fontWeight: 600 }}>TrackFlow</span>
                            </div>
                            <p style={{
                                fontSize: '0.8125rem', color: 'var(--color-text-muted)',
                                lineHeight: 1.7, maxWidth: '260px',
                            }}>
                                Analytics, heatmaps, and session recordings in one script.
                            </p>
                        </div>
                        {[
                            { title: 'Product', links: [{ label: 'Features', href: '#features' }, { label: 'Pricing', href: '#pricing' }, { label: 'Demo', href: '/demo' }] },
                            { title: 'Company', links: [{ label: 'About', href: '#' }, { label: 'Blog', href: '#' }, { label: 'Contact', href: '#' }] },
                            { title: 'Legal', links: [{ label: 'Privacy', href: '#' }, { label: 'Terms', href: '#' }, { label: 'GDPR', href: '#' }] },
                        ].map((group, i) => (
                            <div key={i}>
                                <h5 style={{
                                    fontSize: '0.8125rem', fontWeight: 600,
                                    marginBottom: '12px', color: 'var(--color-text-primary)',
                                }}>{group.title}</h5>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {group.links.map((link, j) => (
                                        <Link key={j} href={link.href} style={{
                                            color: 'var(--color-text-muted)', textDecoration: 'none',
                                            fontSize: '0.8125rem',
                                        }}>{link.label}</Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{
                        paddingTop: '20px',
                        borderTop: '1px solid var(--color-border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            © {new Date().getFullYear()} TrackFlow
                        </p>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <Link href="/login" style={{ color: 'var(--color-text-muted)', textDecoration: 'none', fontSize: '0.75rem' }}>Login</Link>
                            <Link href="/register" style={{ color: 'var(--color-text-muted)', textDecoration: 'none', fontSize: '0.75rem' }}>Register</Link>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
