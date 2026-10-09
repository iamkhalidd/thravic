'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { BarChart3, ArrowRight, Check, Menu, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { ThemeToggle } from '@/components/ThemeToggle';
import { formatPlanPrice, payments, planPeriod } from '@/lib/api';

// Dynamically import Recharts-based views to prevent SSR hydration mismatches
const OverviewView = dynamic(() => import('./demo/DemoViews').then(mod => mod.OverviewView), { ssr: false });
const SessionsView = dynamic(() => import('./demo/DemoViews').then(mod => mod.SessionsView), { ssr: false });
const FunnelsView = dynamic(() => import('./demo/DemoViews').then(mod => mod.FunnelsView), { ssr: false });
const HeatmapsView = dynamic(() => import('./demo/DemoViews').then(mod => mod.HeatmapsView), { ssr: false });
const InsightsView = dynamic(() => import('./demo/DemoViews').then(mod => mod.InsightsView), { ssr: false });

/* ─── DATA ─── */

// The install flow as the dashboard runs it (dashboard/domains/new)
const journey = [
    { title: 'Add your site', body: 'Enter your domain in the dashboard and Thravic creates a tracking ID for it.' },
    { title: 'Paste the script', body: 'Copy one tag into your site’s head. There are instructions for HTML, WordPress, Shopify, Webflow and Next.js.' },
    { title: 'Verify it', body: 'Thravic checks the script is live. Data appears within a few minutes of your first visitor.' },
    { title: 'Find it and fix it', body: 'Replays, heatmaps and funnels show where people struggle. Ship a fix, then compare periods to see if it worked.' },
];

const stories = [
    {
        label: 'replays', View: SessionsView, view: 'sessions',
        title: 'Watch the visit, not a summary of it.',
        body: 'Session replays play back clicks, scrolls and page changes as they happened. Form inputs are masked before anything leaves the browser, so you see where someone struggled without seeing what they typed.',
    },
    {
        label: 'funnels', View: FunnelsView, view: 'funnels',
        title: 'Find the step where people give up.',
        body: 'Define the steps of your signup or checkout. Thravic shows how many visitors reach each one and where the biggest drop happens.',
    },
    {
        label: 'heatmaps', View: HeatmapsView, view: 'heatmaps',
        title: 'See what gets clicked and what never gets seen.',
        body: 'Click maps show where attention lands on each page. Scroll depth shows how far down people actually get, so you know whether your call to action is above the drop.',
    },
    {
        label: 'AI insights', View: InsightsView, view: 'insights',
        title: 'A daily read on what changed.',
        body: 'Each day Thravic reports what moved on your site, ranks it by priority and suggests what to do about it, with a short forecast of where traffic is heading.',
    },
];

const alsoIncluded = [
    { name: 'Traffic sources', detail: 'Channels, referrers, search engines and social networks.' },
    { name: 'UTM campaigns', detail: 'Sessions, visitors and pageviews for every UTM-tagged link.' },
    { name: 'Pages and paths', detail: 'Entry and exit pages, and how people move between them.' },
    { name: 'Devices', detail: 'Device types, browsers and operating systems.' },
    { name: 'Errors', detail: 'JavaScript errors and crashes, most frequent first.' },
    { name: 'Performance', detail: 'Core Web Vitals for each page.' },
    { name: 'Forms', detail: 'Submissions for every form on your site.' },
    { name: 'Rage clicks', detail: 'Elements people click again and again because nothing happens.' },
    { name: 'Reports and webhooks', detail: 'CSV exports of your raw data, and events sent to your own systems.' },
    { name: 'Team', detail: 'Invite teammates to the same sites.' },
];

const privacyFacts = [
    'No cookies. Visits are counted with browser storage instead.',
    'Every form input is masked in session replays.',
    'Honors Do Not Track and Global Privacy Control.',
    'Optional consent mode: nothing is tracked until the visitor opts in.',
];

// Shown only if the plans API can't be reached; normally every card comes from
// the admin-managed plans (GET /api/payments/plans).
type Tier = { id: string; name: string; price: string; period?: string; description: string; features: string[]; cta: string; highlighted: boolean; badge?: string };

const pricingTiers: Tier[] = [
    {
        id: 'free', name: 'Hobby', price: 'Free', description: 'For personal projects',
        features: ['1 website', '5k events/month', 'Core analytics & UTM', '30-day retention'],
        cta: 'Get Started Free', highlighted: false
    },
    {
        id: 'pro', name: 'Pro', price: '₦45,000', period: '/mo', description: 'For startups & businesses',
        features: ['3 websites', '100k events/month', 'Heatmaps & recordings', 'Funnels & AI insights', 'CSV export & team', '1-year retention'],
        cta: 'Upgrade to Pro', highlighted: true
    },
    {
        id: 'agency', name: 'Agency', price: '₦125,000', period: '/mo', description: 'For agencies & scale',
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
        background: 'color-mix(in srgb, var(--color-bg-primary) 72%, transparent)',
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
        paddingTop: 'clamp(112px, 16vh, 160px)', paddingBottom: '120px',
        textAlign: 'center' as const,
        position: 'relative' as const,
    },
    h1: {
        fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
        fontWeight: 600,
        letterSpacing: '-0.035em',
        lineHeight: 1.05,
        margin: '0 auto 24px',
        maxWidth: '16ch',
        color: 'var(--color-text-primary)',
        textWrap: 'balance' as const,
    },
    heroSub: {
        fontSize: 'clamp(1.0625rem, 1.6vw, 1.25rem)',
        color: 'var(--color-text-secondary)',
        maxWidth: '560px',
        margin: '0 auto 36px',
        lineHeight: 1.55,
        letterSpacing: '-0.01em',
        textWrap: 'pretty' as const,
    },
    ctaRow: {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
        flexWrap: 'wrap' as const,
    },
    heroCta: {
        padding: '12px 20px', borderRadius: '8px', fontSize: '0.9375rem', fontWeight: 500,
        display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none',
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
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [tiers, setTiers] = useState<Tier[]>(pricingTiers);

    React.useEffect(() => {
        // Every card comes from the admin-managed plans; the built-in tiers above
        // are only the fallback if the API can't be reached.
        payments.getPlans().then(({ data }) => {
            const shown = data?.plans?.filter(plan => plan.show_on_landing !== false) ?? [];
            if (!shown.length) return;
            setTiers(shown.map(plan => ({
                id: plan.id,
                name: plan.name,
                price: formatPlanPrice(plan.price, plan.currency),
                period: planPeriod(plan),
                description: plan.tagline ?? '',
                features: plan.bullets ?? [],
                cta: plan.price <= 0 ? 'Get Started Free' : `Get ${plan.name}`,
                highlighted: !!plan.badge,
                badge: plan.badge || undefined,
            })));
        });
    }, []);

    return (
        <div style={s.page}>
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
                        <span style={{ fontSize: '0.9375rem', fontWeight: 600, letterSpacing: '-0.02em' }}>Thravic</span>
                    </Link>

                        <div className="desktop-only" style={{ display: 'flex', gap: '24px' }}>
                            {[
                                { label: 'How it works', href: '#how-it-works' },
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
                            <ThemeToggle />
                            <Link href="/login" style={{
                                color: 'var(--color-text-secondary)', textDecoration: 'none',
                                fontSize: '0.8125rem', fontWeight: 500,
                            }} className="desktop-only">Log in</Link>
                            <Link href="/register" className="btn-primary" style={{
                                padding: '6px 14px', borderRadius: '6px', fontSize: '0.8125rem',
                                fontWeight: 500, textDecoration: 'none', display: 'inline-flex',
                            }}>Sign up</Link>
                            <button 
                                className="lp-nav-mobile-btn desktop-hidden"
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                aria-label="Toggle menu"
                                style={{
                                    background: 'transparent', border: 'none', color: 'var(--color-text-primary)',
                                    cursor: 'pointer', padding: '4px',
                                }}
                            >
                                {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                            </button>
                        </div>
                    </div>
                </nav>

                {/* Mobile Menu Dropdown */}
                <div className={`lp-nav-links ${isMobileMenuOpen ? 'active' : ''}`}>
                    {[
                        { label: 'How it works', href: '#how-it-works' },
                        { label: 'Features', href: '#features' },
                        { label: 'Pricing', href: '#pricing' },
                        { label: 'Demo', href: '/demo' },
                    ].map(link => (
                        <Link 
                            key={link.label} 
                            href={link.href} 
                            onClick={() => setIsMobileMenuOpen(false)}
                            style={{
                                color: 'var(--color-text-primary)', textDecoration: 'none',
                                fontSize: '1rem', fontWeight: 500, padding: '12px 0', width: '100%',
                                borderBottom: '1px solid rgba(255,255,255,0.05)'
                            }}
                        >
                            {link.label}
                        </Link>
                    ))}
                </div>

            {/* ═══ HERO ═══ */}
            <section style={s.hero}>
                <div style={s.container}>
                    <h1 style={s.h1}>
                        See why visitors leave, not just that they did.
                    </h1>

                    <p style={s.heroSub}>
                        Session replays, heatmaps and conversion funnels from one lightweight script.
                        Watch real visits, find the step where people drop off, and fix it.
                    </p>

                    <div style={s.ctaRow}>
                        <Link href="/register" className="btn-primary" style={s.heroCta}>
                            Start free <ArrowRight size={16} />
                        </Link>
                        <Link href="/demo" className="btn-secondary" style={s.heroCta}>
                            Try the live demo
                        </Link>
                    </div>

                    <ul className="lp-hero-facts">
                        <li>One script tag</li>
                        <li>~6 KB gzipped</li>
                        <li>Form inputs masked in replays</li>
                    </ul>

                    {/* Product preview: the real demo dashboard, cropped to its first screen */}
                    <div className="lp-hero-preview">
                        <Link href="/demo" className="lp-hero-preview-bar">
                            <span>Live demo</span>
                            <span>Sample data<span className="desktop-inline"> · Open the full demo</span> <ArrowRight size={12} /></span>
                        </Link>
                        <div className="lp-hero-preview-body">
                            <OverviewView />
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══ HOW IT WORKS ═══ */}
            <section id="how-it-works" className="lp-section">
                <div style={s.container}>
                    <div className="lp-section-head">
                        <h2 style={s.sectionTitle}>Live on your site in four steps</h2>
                        <p style={s.sectionSub}>
                            One tag in your site&apos;s head is the whole install. No tag manager, no build changes.
                        </p>
                    </div>

                    <ol className="lp-steps">
                        {journey.map((step, i) => (
                            <li key={step.title} className="lp-step">
                                <span className="lp-step-num">{String(i + 1).padStart(2, '0')}</span>
                                <h3>{step.title}</h3>
                                <p>{step.body}</p>
                                {i === 1 && (
                                    <pre className="lp-code" aria-label="Example tracking script">
                                        <code>{'<script async src=".../tf.js"\n  data-tracking-id="your-id">\n</script>'}</code>
                                    </pre>
                                )}
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* ═══ WHAT YOU SEE ═══ */}
            <section id="features" className="lp-section">
                <div style={s.container}>
                    <div className="lp-section-head">
                        <h2 style={s.sectionTitle}>What you see once it&apos;s running</h2>
                        <p style={s.sectionSub}>
                            Every view below is the real dashboard, filled with sample data.
                        </p>
                    </div>

                    <div className="lp-stories">
                        {stories.map((story, i) => (
                            <div key={story.title} className={i % 2 ? 'lp-story-grid-reverse' : 'lp-story-grid'}>
                                <div className="lp-story-grid-text lp-story-copy">
                                    <h3>{story.title}</h3>
                                    <p>{story.body}</p>
                                    <Link href={`/demo?view=${story.view}`} className="lp-text-link">
                                        Open {story.label} in the demo <ArrowRight size={14} />
                                    </Link>
                                </div>
                                <div className="lp-story-grid-mockup">
                                    <div className="lp-shot" aria-hidden="true">
                                        <div className="lp-shot-body">
                                            <story.View />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══ EVERYTHING ELSE ═══ */}
            <section className="lp-section">
                <div style={s.container}>
                    <div className="lp-split">
                        <div>
                            <h2 style={{ ...s.sectionTitle, fontSize: 'clamp(1.75rem, 3vw, 2.5rem)' }}>Also in the dashboard</h2>
                            <p style={{ ...s.sectionSub, margin: 0 }}>
                                The analytics you&apos;d expect, next to the tools that explain them.
                            </p>
                        </div>
                        <dl className="lp-also">
                            {alsoIncluded.map(item => (
                                <div key={item.name}>
                                    <dt>{item.name}</dt>
                                    <dd>{item.detail}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                </div>
            </section>

            {/* ═══ PRIVACY ═══ */}
            <section className="lp-section">
                <div style={s.container}>
                    <div className="lp-split">
                        <div>
                            <h2 style={{ ...s.sectionTitle, fontSize: 'clamp(1.75rem, 3vw, 2.5rem)' }}>Built to collect less</h2>
                            <p style={{ ...s.sectionSub, margin: 0 }}>
                                You see how people use your site. You don&apos;t see what they type.
                            </p>
                        </div>
                        <ul className="lp-checks">
                            {privacyFacts.map(fact => (
                                <li key={fact}><Check size={16} strokeWidth={2} aria-hidden="true" /> {fact}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            {/* ═══ PRICING ═══ */}
            <section id="pricing" className="lp-section">
                <div style={s.container}>
                    <div className="lp-section-head">
                        <h2 style={s.sectionTitle}>Pricing</h2>
                        <p style={s.sectionSub}>Start free. Upgrade when you need more sites, more events or longer history.</p>
                    </div>

                    <div className="lp-pricing">
                        {tiers.map(tier => (
                            <div key={tier.id} className={`lp-plan${tier.highlighted ? ' lp-plan-featured' : ''}`}>
                                <div className="lp-plan-head">
                                    <h3>{tier.name}</h3>
                                    {tier.badge && <span className="badge">{tier.badge}</span>}
                                </div>
                                <p className="lp-plan-desc">{tier.description}</p>
                                <p className="lp-plan-price">
                                    {tier.price}
                                    {tier.period && <span>{tier.period}</span>}
                                </p>
                                <ul className="lp-plan-features">
                                    {tier.features.map(feature => (
                                        <li key={feature}>
                                            <Check size={14} strokeWidth={2} aria-hidden="true" />
                                            {feature}
                                        </li>
                                    ))}
                                </ul>
                                <Link href="/register" className={tier.highlighted ? 'btn-primary' : 'btn-secondary'}>
                                    {tier.cta}
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══ CTA ═══ */}
            <section className="lp-section">
                <div style={{ ...s.container, textAlign: 'center' as const }}>
                    <h2 style={s.sectionTitle}>Find out where your visitors drop off.</h2>
                    <p style={{ ...s.sectionSub, marginBottom: '36px' }}>
                        Create a free account and paste the script. Data appears within a few minutes of your next visitor.
                    </p>
                    <div style={s.ctaRow}>
                        <Link href="/register" className="btn-primary" style={s.heroCta}>
                            Start free <ArrowRight size={16} />
                        </Link>
                        <Link href="/demo" className="btn-secondary" style={s.heroCta}>
                            Explore the demo
                        </Link>
                    </div>
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
                                <span style={{ fontSize: '0.875rem', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>Thravic</span>
                            </div>
                        </div>
                        {[
                            { title: 'Product', links: [{ label: 'Features', href: '#features' }, { label: 'Pricing', href: '#pricing' }, { label: 'Demo', href: '/demo' }] },
                            { title: 'Company', links: [{ label: 'About', href: '/about' }, { label: 'Contact', href: '/contact' }] },
                            { title: 'Legal', links: [{ label: 'Privacy', href: '/privacy' }, { label: 'GDPR', href: '/gdpr' }, { label: 'Cookies', href: '/cookies' }] },
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
                            © {new Date().getFullYear()} Thravic
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
