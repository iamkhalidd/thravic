'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Menu, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { ThemeToggle } from '@/components/ThemeToggle';
import ShaderBackdrop from '@/components/ShaderBackdrop';
import { ThemedLogo } from '@/components/ThemedLogo';
import { payments } from '@/lib/api';
import { toTiers, type Tier } from '@/lib/landingPlans';
import { EVENTS_PER_VISIT, NGN_PER_USD, WALKTHROUGH_VIDEO_URL } from '@/lib/landing';
import CompareTable from './CompareTable';
import FaqList from './FaqList';
import HeroReplay from './HeroReplay';
import Reveal from './Reveal';
import ScrollEffects from './ScrollEffects';

// Dynamically import Recharts-based views to prevent SSR hydration mismatches
const OverviewView = dynamic(() => import('../demo/DemoViews').then(mod => mod.OverviewView), { ssr: false });
const SessionsView = dynamic(() => import('../demo/DemoViews').then(mod => mod.SessionsView), { ssr: false });
const FunnelsView = dynamic(() => import('../demo/DemoViews').then(mod => mod.FunnelsView), { ssr: false });
const HeatmapsView = dynamic(() => import('../demo/DemoViews').then(mod => mod.HeatmapsView), { ssr: false });
const InsightsView = dynamic(() => import('../demo/DemoViews').then(mod => mod.InsightsView), { ssr: false });
const AppOverviewView = dynamic(() => import('../demo/DemoViews').then(mod => mod.AppOverviewView), { ssr: false });

/* ─── DATA ─── */

// The install flow as the dashboard runs it (dashboard/domains/new), for a
// website and for a mobile app. Step 2 shows its code under the text.
type Platform = 'web' | 'app';

const journeys: Record<Platform, { head: string; sub: string; code: string; codeLabel: string; steps: { title: string; body: string }[] }> = {
    web: {
        head: 'Live on your site in four steps',
        sub: 'One tag in your site’s head is the whole install. No tag manager, no build changes.',
        codeLabel: 'Example tracking script',
        code: '<script async src=".../tf.js"\n  data-tracking-id="your-id">\n</script>',
        steps: [
            { title: 'Add your site', body: 'Enter your domain in the dashboard and Thravic creates a tracking ID for it.' },
            { title: 'Paste the script', body: 'Copy one tag into your site’s head. There are instructions for HTML, WordPress, Shopify, Webflow and Next.js.' },
            { title: 'Verify it', body: 'Thravic checks the script is live. Data appears within a few minutes of your first visitor.' },
            { title: 'Find it and fix it', body: 'Replays, heatmaps and funnels show where people struggle. Ship a fix, then compare periods to see if it worked.' },
        ],
    },
    app: {
        head: 'Live in your app in four steps',
        sub: 'One package and one line of setup for React Native and Expo. Works in Expo Go, no config plugin.',
        codeLabel: 'Example SDK setup',
        code: "npx expo install \\\n  @thravic/react-native\n\nThravic.init('your-id', {\n  bundleId: 'com.acme.shop',\n});",
        steps: [
            { title: 'Add your app', body: 'Choose Mobile app in the dashboard and enter its name and bundle ID. Thravic creates a tracking ID for it.' },
            { title: 'Install the SDK', body: 'Add the package and start it when your app loads. Screen views come from React Navigation or Expo Router.' },
            { title: 'Verify it', body: 'Open the app and visit a screen or two. Thravic checks events are arriving, and data appears within a minute.' },
            { title: 'Find it and fix it', body: 'Screens, paths and funnels show where people drop off. Versions show whether a release made things better.' },
        ],
    },
};

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
    {
        label: 'the sample app', View: AppOverviewView, view: 'overview', href: '/demo?property=app',
        title: 'Your app, next to your website.',
        body: 'Add a React Native or Expo app and see its screens, sessions, versions and devices in the same dashboard. Paths, funnels and insights work the same way they do for your site.',
    },
];

const alsoIncluded: { name: string; detail: string; href?: string }[] = [
    { name: 'Mobile apps', detail: 'Screens, sessions and versions from React Native and Expo apps.', href: '/docs/react-native' },
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

// "100k events/month" in a plan bullet → 100000. Null when no bullet names a limit.
function eventLimit(features: string[]): number | null {
    for (const feature of features) {
        const m = feature.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([km]?)\s*events/i);
        if (m) return Number(m[1]) * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase() as 'k' | 'm'] ?? 1);
    }
    return null;
}

function compact(n: number): string {
    return n >= 10_000 ? `${Math.round(n / 1000).toLocaleString()}k` : (Math.round(n / 100) * 100).toLocaleString();
}

// Only shown once EVENTS_PER_VISIT is filled in from real data.
function visitsLine(features: string[]): string | null {
    const limit = eventLimit(features);
    if (!EVENTS_PER_VISIT || !limit) return null;
    return `≈ ${compact(limit / EVENTS_PER_VISIT)} visits a month`;
}

function usdLine(tier: Tier): string | null {
    if (!NGN_PER_USD || tier.currency !== 'NGN' || tier.amount <= 0) return null;
    return `≈ $${Math.round(tier.amount / NGN_PER_USD).toLocaleString()}${tier.period ?? ''}`;
}

function isDirectVideo(url: string) {
    return /\.(mp4|webm)(\?|$)/i.test(url);
}

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
        // Keeps the shader backdrop behind the hero's content, above the page
        isolation: 'isolate' as const,
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
export default function LandingPage({ initialTiers }: { initialTiers: Tier[] | null }) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    // The server normally sends the plans with the page. If it couldn't reach
    // the API, try once more from the browser; never show made-up prices.
    const [tiers, setTiers] = useState<Tier[] | null>(initialTiers);
    const [plansFailed, setPlansFailed] = useState(false);
    const [platform, setPlatform] = useState<Platform>('web');
    const journey = journeys[platform];

    // Shown after the hero, hidden again once the final call to action is on screen.
    const [showStickyCta, setShowStickyCta] = useState(false);
    React.useEffect(() => {
        const update = () => {
            const final = document.querySelector('.lp-cta-final');
            const finalInView = final ? final.getBoundingClientRect().top < window.innerHeight : false;
            setShowStickyCta(window.scrollY > 600 && !finalInView);
        };
        update();
        window.addEventListener('scroll', update, { passive: true });
        return () => window.removeEventListener('scroll', update);
    }, []);

    React.useEffect(() => {
        if (initialTiers) return;
        payments.getPlans().then(({ data }) => {
            const shown = toTiers(data?.plans);
            if (shown.length) setTiers(shown);
            else setPlansFailed(true);
        });
    }, [initialTiers]);

    return (
        <div style={s.page}>
            <ScrollEffects />
            {/* ═══ NAV ═══ */}
            <nav style={s.nav}>
                <div style={s.navInner}>
                    <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: 'var(--color-text-primary)' }}>
                        <ThemedLogo height={24} />
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
                <ShaderBackdrop fade />
                <div className="lp-hero-glow" aria-hidden="true" />
                <div className="lp-hero-content" style={s.container}>
                    <h1 style={s.h1}>
                        See why visitors <span className="lp-accent">leave</span>, not just that they did.
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
                    <p className="lp-cta-note">Free plan, no card needed.</p>

                    <ul className="lp-hero-facts">
                        <li>One script tag</li>
                        <li>~6 KB gzipped</li>
                        <li>Form inputs masked in replays</li>
                        <li>React Native SDK for apps</li>
                    </ul>

                    {/* A replay playing back, a rage click caught, the heatmap behind it */}
                    <div className="lp-hero-stage">
                        <HeroReplay />
                    </div>
                </div>
            </section>

            {/* ═══ HOW IT WORKS ═══ */}
            <section id="how-it-works" className="lp-section">
                <div style={s.container}>
                    <div className="lp-section-head">
                        <h2 style={s.sectionTitle}>{journey.head}</h2>
                        <p style={s.sectionSub}>{journey.sub}</p>
                        <div role="tablist" aria-label="Install for" style={{
                            display: 'inline-flex', gap: 4, padding: 4, marginTop: 24,
                            background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 999,
                        }}>
                            {([['web', 'Website'], ['app', 'Mobile app']] as const).map(([id, label]) => (
                                <button key={id} type="button" role="tab" aria-selected={platform === id} onClick={() => setPlatform(id)}
                                    style={{
                                        padding: '6px 16px', borderRadius: 999, cursor: 'pointer', fontSize: '0.875rem',
                                        border: 'none', fontWeight: platform === id ? 600 : 400,
                                        background: platform === id ? 'var(--color-bg-card)' : 'transparent',
                                        color: platform === id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                                    }}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <ol className="lp-steps">
                        {journey.steps.map((step, i) => (
                            <li key={step.title} className="lp-step">
                                <span className="lp-step-num">{String(i + 1).padStart(2, '0')}</span>
                                <h3>{step.title}</h3>
                                <p>{step.body}</p>
                                {i === 1 && (
                                    <pre className="lp-code" aria-label={journey.codeLabel}>
                                        <code>{journey.code}</code>
                                    </pre>
                                )}
                                {i === 1 && (
                                    <Link href={platform === 'app' ? '/docs/react-native' : '/docs'} className="lp-text-link" style={{ marginTop: 12 }}>
                                        {platform === 'app' ? 'Full setup guide' : 'Install guides'} <ArrowRight size={14} />
                                    </Link>
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
                        <h2 style={s.sectionTitle}>What you see once it&apos;s <span className="lp-accent">running</span></h2>
                        <p style={s.sectionSub}>
                            Every view below is the real dashboard, filled with sample data.
                        </p>
                    </div>

                    {WALKTHROUGH_VIDEO_URL && (
                        <div className="lp-video">
                            {isDirectVideo(WALKTHROUGH_VIDEO_URL)
                                ? <video src={WALKTHROUGH_VIDEO_URL} controls preload="metadata" playsInline />
                                : <iframe src={WALKTHROUGH_VIDEO_URL} title="Thravic walkthrough" loading="lazy"
                                    allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />}
                        </div>
                    )}

                    {/* The real demo dashboard, cropped to its first screen */}
                    <Reveal minHeight={520}>
                        <div className="lp-hero-preview">
                            <Link href="/demo" className="lp-hero-preview-bar">
                                <span><i className="lp-live-dot" aria-hidden="true" />Live demo</span>
                                <span>Sample data<span className="desktop-inline"> · Open the full demo</span> <ArrowRight size={12} /></span>
                            </Link>
                            <div className="lp-hero-preview-body">
                                <OverviewView />
                            </div>
                        </div>
                    </Reveal>

                    <div className="lp-stories">
                        {stories.map((story, i) => (
                            <div key={story.title} className={i % 2 ? 'lp-story-grid-reverse' : 'lp-story-grid'}>
                                <div className="lp-story-grid-text lp-story-copy">
                                    <h3>{story.title}</h3>
                                    <p>{story.body}</p>
                                    <Link href={story.href ?? `/demo?view=${story.view}`} className="lp-text-link">
                                        Open {story.label} in the demo <ArrowRight size={14} />
                                    </Link>
                                </div>
                                <div className="lp-story-grid-mockup">
                                    <Reveal minHeight={400}>
                                        <div className="lp-shot" aria-hidden="true">
                                            <div className="lp-shot-body">
                                                <story.View />
                                            </div>
                                        </div>
                                    </Reveal>
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
                                    <dd>
                                        {item.detail}
                                        {item.href && <> <Link href={item.href} style={{ color: 'inherit', textDecoration: 'underline' }}>Setup guide</Link></>}
                                    </dd>
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

            {/* ═══ COMPARE ═══ */}
            <section id="compare" className="lp-section">
                <div style={s.container}>
                    <div className="lp-section-head">
                        <h2 style={s.sectionTitle}>How it compares</h2>
                        <p style={s.sectionSub}>
                            Clarity and Google Analytics are free and good at what they do. Thravic puts replays, heatmaps,
                            funnels and traffic in one dashboard, sets no cookies, and bills in naira.
                        </p>
                    </div>
                    <CompareTable />
                    <p style={{ textAlign: 'center', marginTop: 24 }}>
                        <Link href="/compare" className="lp-text-link">
                            Read the full comparison <ArrowRight size={14} />
                        </Link>
                    </p>
                </div>
            </section>

            {/* ═══ PRICING ═══ */}
            <section id="pricing" className="lp-section">
                <div style={s.container}>
                    <div className="lp-section-head">
                        <h2 style={s.sectionTitle}>Pricing</h2>
                        <p style={s.sectionSub}>Start free. Upgrade when you need more sites, more events or longer history.</p>
                    </div>

                    {tiers ? (
                        <div className="lp-pricing">
                            {tiers.map(tier => {
                                const usd = usdLine(tier);
                                const visits = visitsLine(tier.features);
                                return (
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
                                        {(usd || visits) && (
                                            <p className="lp-plan-sub">{[usd, visits].filter(Boolean).join(' · ')}</p>
                                        )}
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
                                );
                            })}
                        </div>
                    ) : (
                        <p className="lp-plans-status" role="status">
                            {plansFailed
                                ? <>Plans couldn&apos;t load just now. <Link href="/register">Sign up free</Link> to see current prices in your dashboard.</>
                                : 'Loading current plans…'}
                        </p>
                    )}
                    <p className="lp-plans-note">
                        An event is one thing a visit records: a page view, a click, a scroll milestone, an error or your own custom event.
                        Paid plans don&apos;t renew on their own.
                    </p>
                </div>
            </section>

            {/* ═══ FAQ ═══ */}
            <section id="faq" className="lp-section">
                <div style={s.container}>
                    <div className="lp-section-head">
                        <h2 style={s.sectionTitle}>Questions</h2>
                    </div>
                    <FaqList />
                </div>
            </section>

            {/* ═══ CTA ═══ */}
            <section className="lp-section lp-cta-final">
                <div style={{ ...s.container, textAlign: 'center' as const }}>
                    <h2 style={s.sectionTitle}>Find out where your visitors <span className="lp-accent">drop off</span>.</h2>
                    <p style={{ ...s.sectionSub, marginBottom: '36px' }}>
                        Create a free account and paste the script. Data appears within a few minutes of your next visitor.
                        No card needed.
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
                                <ThemedLogo height={22} />
                            </div>
                        </div>
                        {[
                            { title: 'Product', links: [{ label: 'Features', href: '#features' }, { label: 'Pricing', href: '#pricing' }, { label: 'Compare', href: '/compare' }, { label: 'FAQ', href: '#faq' }, { label: 'Demo', href: '/demo' }] },
                            { title: 'Docs', links: [{ label: 'All install guides', href: '/docs' }, { label: 'WordPress', href: '/docs/wordpress' }, { label: 'Shopify', href: '/docs/shopify' }, { label: 'Next.js', href: '/docs/nextjs' }, { label: 'React Native & Expo', href: '/docs/react-native' }] },
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

            {/* Phones only: keeps the signup one tap away once the hero has scrolled off */}
            <div className={`lp-sticky-cta${showStickyCta ? ' visible' : ''}`} aria-hidden={!showStickyCta}>
                <span>Free plan, no card needed</span>
                <Link href="/register" className="btn-primary" tabIndex={showStickyCta ? 0 : -1}>
                    Start free <ArrowRight size={14} />
                </Link>
            </div>
        </div>
    );
}
