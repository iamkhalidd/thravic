'use client';

import Link from 'next/link';
import {
    BarChart3, Target, MousePointer2, Video, Sparkles, Globe,
    ArrowRight, Check, Lock
} from 'lucide-react';

/* ─── DATA ─── */

const bentoFeatures = [
    {
        title: 'Understand every click.',
        desc: 'Privacy-safe session recordings let you play back exactly what users do, where they get stuck, and why they leave.',
        icon: Video,
        large: true
    },
    {
        title: 'Funnels that convert.',
        desc: 'Build multi-step conversion funnels and identify the exact drop-off points.',
        icon: Target,
        large: false
    },
    {
        title: 'Visual heatmaps.',
        desc: 'Instantly see where people click and scroll on your key pages.',
        icon: MousePointer2,
        large: false
    },
    {
        title: 'AI Insights.',
        desc: 'Automatic anomaly detection surfaces what needs your attention immediately.',
        icon: Sparkles,
        large: false
    },
    {
        title: 'Traffic & UTMs.',
        desc: 'Track every source, medium, and campaign with full attribution reporting.',
        icon: BarChart3,
        large: true
    }
];

const pricingTiers = [
    {
        name: 'Hobby', price: 'Free', description: 'For personal projects',
        features: ['1 website', '5k events/month', 'Core analytics & UTM', '30-day retention'],
        cta: 'Get Started Fixed', highlighted: false
    },
    {
        name: 'Pro', price: '$29', period: '/mo', description: 'For startups & businesses',
        features: ['3 websites', '100k events/month', 'Heatmaps & recordings', 'Funnels & AI insights', 'CSV export & team', '1-year retention'],
        cta: 'Upgrade to Pro', highlighted: true
    },
    {
        name: 'Agency', price: '$79', period: '/mo', description: 'For agencies & scale',
        features: ['20 websites', '500k events/month', 'Everything in Pro', 'Unlimited team members', '2-year retention', 'Priority support'],
        cta: 'Upgrade to Agency', highlighted: false
    }
];

/* ─── STYLES ─── */
const s = {
    page: { minHeight: '100vh', background: 'var(--color-bg-primary)', position: 'relative' as const, overflow: 'hidden' },
    container: { maxWidth: '1080px', margin: '0 auto', padding: '0 24px', position: 'relative' as const, zIndex: 10 },

    // Nav
    nav: {
        position: 'fixed' as const, top: 0, left: 0, right: 0, zIndex: 50,
        background: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--color-border)',
    },
    navInner: {
        maxWidth: '1080px', margin: '0 auto', padding: '0 24px',
        height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },

    // Hero
    hero: {
        paddingTop: '200px', paddingBottom: '140px',
        textAlign: 'center' as const,
        position: 'relative' as const,
    },
    h1: {
        fontSize: 'clamp(3rem, 7vw, 6rem)',
        fontWeight: 600,
        letterSpacing: '-0.04em',
        lineHeight: 1.05,
        marginBottom: '24px',
        color: 'var(--color-text-primary)',
        marginTop: '24px'
    },
    heroSub: {
        fontSize: 'clamp(1.125rem, 2vw, 1.375rem)',
        color: 'var(--color-text-secondary)',
        maxWidth: '540px',
        margin: '0 auto 40px',
        lineHeight: 1.5,
        letterSpacing: '-0.01em'
    },
    ctaRow: {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
        flexWrap: 'wrap' as const,
    },

    // Badges/Pills
    sectionPill: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.25rem 0.75rem',
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 500,
        color: 'var(--color-text-primary)',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        marginBottom: '24px',
    },

    // Typography
    sectionTitle: {
        fontSize: 'clamp(2rem, 4vw, 3.5rem)', fontWeight: 600,
        letterSpacing: '-0.03em', marginBottom: '24px',
        color: 'var(--color-text-primary)'
    },
    sectionSub: {
        fontSize: '1.125rem', color: 'var(--color-text-secondary)',
        maxWidth: '540px', margin: '0 auto', lineHeight: 1.6,
        letterSpacing: '-0.01em'
    },
};

/* ─── COMPONENT ─── */
export default function HomePage() {
    return (
        <div style={s.page}>
            <div className="linear-hero-grid"></div>

            {/* ═══ NAV ═══ */}
            <nav style={s.nav}>
                <div style={s.navInner}>
                    <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: 'var(--color-text-primary)' }}>
                        <div style={{
                            width: '24px', height: '24px', borderRadius: '6px',
                            background: 'var(--color-text-primary)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            <BarChart3 size={14} style={{ color: 'var(--color-bg-primary)' }} />
                        </div>
                        <span style={{ fontSize: '0.9375rem', fontWeight: 600, letterSpacing: '-0.02em' }}>TrackFlow</span>
                    </Link>

                    <div className="desktop-only" style={{ display: 'flex', gap: '24px' }}>
                        {[
                            { label: 'Features', href: '#features' },
                            { label: 'Pricing', href: '#pricing' },
                            { label: 'Demo', href: '/demo' },
                        ].map(link => (
                            <Link key={link.label} href={link.href} style={{
                                color: 'var(--color-text-secondary)', textDecoration: 'none',
                                fontSize: '0.8125rem', fontWeight: 500, transition: 'color 0.2s'
                            }}>{link.label}</Link>
                        ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Link href="/login" style={{
                            color: 'var(--color-text-secondary)', textDecoration: 'none',
                            fontSize: '0.8125rem', fontWeight: 500,
                        }}>Log in</Link>
                    </div>
                </div>
            </nav>

            {/* ═══ HERO ═══ */}
            <section style={s.hero}>
                <div style={s.container}>
                    <div className="linear-pill">
                        <Sparkles size={12} style={{ color: 'var(--color-text-muted)' }} />
                        <span>TrackFlow Public Beta</span>
                        <ArrowRight size={12} style={{ color: 'var(--color-text-muted)' }} />
                    </div>

                    <h1 style={s.h1}>
                        The analytics system<br />
                        <span className="text-gradient">for modern teams.</span>
                    </h1>
                    
                    <p style={s.heroSub}>
                        Purpose-built for speed and clarity. TrackFlow turns overwhelming data into undeniable user insights in milliseconds.
                    </p>
                    
                    <div style={s.ctaRow}>
                        <Link href="/register" className="btn-primary" style={{ padding: '12px 24px', borderRadius: '999px', fontSize: '0.875rem', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
                            Start tracking free <ArrowRight size={14} />
                        </Link>
                        <Link href="/demo" style={{ padding: '12px 24px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', borderRadius: '999px', fontSize: '0.875rem', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', backdropFilter: 'blur(10px)' }}>
                            View interactive demo <Globe size={14} style={{ color: 'var(--color-text-muted)' }}/>
                        </Link>
                    </div>
                </div>
            </section>

            {/* ═══ BENTO FEATURES ═══ */}
            <section id="features" style={{ padding: '120px 0', borderTop: '1px solid var(--color-border)' }}>
                <div style={s.container}>
                    <div style={{ textAlign: 'center', marginBottom: '80px' }}>
                        <div style={s.sectionPill}>Features</div>
                        <h2 style={s.sectionTitle}>Built for clarity.</h2>
                        <p style={s.sectionSub}>
                            Every tool you need to understand user behavior, seamlessly integrated into a single, high-performance platform.
                        </p>
                    </div>

                    <div className="bento-grid">
                        {bentoFeatures.map((f, i) => {
                            const Icon = f.icon;
                            return (
                                <div key={i} className={`bento-item ${f.large ? 'bento-item-large' : ''}`}>
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '10px',
                                        background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                                    }}>
                                        <Icon size={18} style={{ color: 'var(--color-text-primary)' }} strokeWidth={1.5} />
                                    </div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 500, letterSpacing: '-0.02em', marginBottom: '12px', color: 'var(--color-text-primary)' }}>
                                        {f.title}
                                    </h3>
                                    <p style={{
                                        fontSize: '0.9375rem', color: 'var(--color-text-secondary)',
                                        lineHeight: 1.6, margin: 0, letterSpacing: '-0.01em'
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
                padding: '120px 0',
                borderTop: '1px solid var(--color-border)',
            }}>
                <div style={s.container}>
                    <div style={{ textAlign: 'center', marginBottom: '80px' }}>
                        <div style={s.sectionPill}>Pricing</div>
                        <h2 style={s.sectionTitle}>Scale without surprises.</h2>
                        <p style={s.sectionSub}>No opaque metrics. No arbitrary limits on seats. Just straightforward pricing for teams of any size.</p>
                    </div>

                    <div className="lp-grid-3" style={{ maxWidth: '960px', margin: '0 auto' }}>
                        {pricingTiers.map((tier, i) => (
                            <div key={i} style={{
                                background: 'transparent',
                                borderTop: '1px solid var(--color-border)',
                                paddingTop: '32px',
                                position: 'relative',
                            }}>
                                <h4 style={{ fontSize: '1.125rem', fontWeight: 500, marginBottom: '8px', color: 'var(--color-text-primary)' }}>{tier.name}</h4>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '32px', minHeight: '40px' }}>
                                    {tier.description}
                                </p>
                                <div style={{ marginBottom: '32px' }}>
                                    <span style={{ fontSize: '3rem', fontWeight: 500, letterSpacing: '-0.04em', color: 'var(--color-text-primary)' }}>
                                        {tier.price}
                                    </span>
                                    {tier.period && (
                                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginLeft: '4px' }}>
                                            {tier.period}
                                        </span>
                                    )}
                                </div>
                                <ul style={{
                                    listStyle: 'none', padding: 0, marginBottom: '40px',
                                    display: 'flex', flexDirection: 'column', gap: '16px',
                                }}>
                                    {tier.features.map((feature, idx) => (
                                        <li key={idx} style={{
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            fontSize: '0.875rem', color: 'var(--color-text-secondary)',
                                        }}>
                                            <Check size={14} style={{ color: 'var(--color-text-primary)', flexShrink: 0 }} strokeWidth={2} />
                                            {feature}
                                        </li>
                                    ))}
                                </ul>
                                <Link href="/register" style={{
                                    display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px 0',
                                    background: tier.highlighted ? 'var(--color-text-primary)' : 'rgba(255,255,255,0.03)',
                                    border: tier.highlighted ? 'none' : '1px solid var(--color-border)',
                                    borderRadius: '8px',
                                    color: tier.highlighted ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
                                    textDecoration: 'none', fontWeight: 500, fontSize: '0.875rem',
                                    transition: 'background 0.2s',
                                }}>{tier.cta}</Link>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══ CTA ═══ */}
            <section style={{ padding: '160px 0', borderTop: '1px solid var(--color-border)' }}>
                <div style={{ ...s.container, textAlign: 'center' as const }}>
                    <div style={{ 
                        width: '64px', height: '64px', margin: '0 auto 32px', borderRadius: '16px',
                        background: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 32px rgba(255,255,255,0.1)'
                    }}>
                        <BarChart3 size={32} style={{ color: 'var(--color-bg-primary)' }} strokeWidth={1.5} />
                    </div>
                    <h2 style={s.sectionTitle}>Build better products, faster.</h2>
                    <p style={{ ...s.sectionSub, marginBottom: '40px' }}>
                        Join the next generation of product teams building with TrackFlow.
                    </p>
                    <Link href="/register" className="btn-primary" style={{ padding: '12px 32px', borderRadius: '999px', fontSize: '0.9375rem', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
                        Get Started Free <ArrowRight size={14} />
                    </Link>
                </div>
            </section>

            {/* ═══ FOOTER ═══ */}
            <footer style={{
                padding: '64px 0 40px',
                borderTop: '1px solid var(--color-border)',
                background: 'var(--color-bg-secondary)'
            }}>
                <div style={s.container}>
                    <div className="lp-grid-footer" style={{ marginBottom: '64px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <div style={{
                                    width: '20px', height: '20px', borderRadius: '4px',
                                    background: 'var(--color-text-primary)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <BarChart3 size={12} style={{ color: 'var(--color-bg-primary)' }} />
                                </div>
                                <span style={{ fontSize: '0.875rem', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>TrackFlow</span>
                            </div>
                        </div>
                        {[
                            { title: 'Product', links: [{ label: 'Features', href: '#features' }, { label: 'Pricing', href: '#pricing' }, { label: 'Demo', href: '/demo' }] },
                            { title: 'Company', links: [{ label: 'About', href: '#' }, { label: 'Blog', href: '#' }, { label: 'Contact', href: '#' }] },
                            { title: 'Legal', links: [{ label: 'Privacy', href: '#' }, { label: 'Terms', href: '#' }, { label: 'GDPR', href: '#' }] },
                        ].map((group, i) => (
                            <div key={i}>
                                <h5 style={{
                                    fontSize: '0.8125rem', fontWeight: 500,
                                    marginBottom: '20px', color: 'var(--color-text-primary)',
                                }}>{group.title}</h5>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {group.links.map((link, j) => (
                                        <Link key={j} href={link.href} style={{
                                            color: 'var(--color-text-secondary)', textDecoration: 'none',
                                            fontSize: '0.8125rem', transition: 'color 0.2s'
                                        }}>{link.label}</Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        color: 'var(--color-text-muted)'
                    }}>
                        <p style={{ fontSize: '0.8125rem' }}>
                            © {new Date().getFullYear()} TrackFlow
                        </p>
                        <div style={{ display: 'flex', gap: '24px' }}>
                            <Link href="/login" style={{ color: 'var(--color-text-muted)', textDecoration: 'none', fontSize: '0.8125rem' }}>Login</Link>
                            <Link href="/register" style={{ color: 'var(--color-text-muted)', textDecoration: 'none', fontSize: '0.8125rem' }}>Register</Link>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
