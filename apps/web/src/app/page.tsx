'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    BarChart3, Target, MousePointer2, Video, Sparkles, Globe,
    ArrowRight, Check, Rocket, Play, Shield, Zap, TrendingUp,
    Users, Clock, ChevronRight, Sun, Moon, Code, Eye, Brain,
    LineChart, Star, Terminal, ArrowUpRight, Layers, Lock
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

/* ─── DATA ─── */

const features = [
    {
        icon: BarChart3,
        title: 'Traffic Analytics',
        description: 'Track every visitor, session, and traffic source in real time. Get full UTM parameter support, referrer tracking, and geo-location data to understand exactly where your audience comes from and how they find you.',
        gradient: '#F29F67',
        color: '#F29F67',
        visual: 'chart'
    },
    {
        icon: Target,
        title: 'Conversion Funnels',
        description: 'Build custom conversion funnels with unlimited steps. Identify exactly where users drop off, compare funnel performance over time, and optimize each stage to maximize conversions.',
        gradient: '#E0B50F',
        color: '#E0B50F',
        visual: 'funnel'
    },
    {
        icon: MousePointer2,
        title: 'Click & Scroll Heatmaps',
        description: 'See exactly where users click, tap, and scroll on every page. Identify dead zones, discover unexpected interaction patterns, and optimize your layouts based on real behavioral data.',
        gradient: '#34B1AA',
        color: '#34B1AA',
        visual: 'heatmap'
    },
    {
        icon: Video,
        title: 'Session Recordings',
        description: 'Watch privacy-safe replays of real user sessions. See every mouse movement, click, and scroll. Filter recordings by page, device, duration, or custom events to find exactly what you need.',
        gradient: '#3B8FF3',
        color: '#3B8FF3',
        visual: 'recording'
    },
    {
        icon: Sparkles,
        title: 'AI-Powered Insights',
        description: 'Let machine learning surface anomalies, predict trends, and suggest optimizations automatically. Get actionable recommendations delivered to your dashboard — no data science degree required.',
        gradient: '#F29F67',
        color: '#F29F67',
        visual: 'ai'
    },
    {
        icon: Globe,
        title: 'Multi-Domain Management',
        description: 'Manage all your websites from a single dashboard. Compare metrics across domains, share team access, and maintain separate tracking configurations — all from one account.',
        gradient: '#E0B50F',
        color: '#E0B50F',
        visual: 'domains'
    }
];

const stats = [
    { value: 10000000, label: 'Events Tracked Daily', display: '10M+', suffix: '+' },
    { value: 5000, label: 'Happy Customers', display: '5,000+', suffix: '+' },
    { value: 99.9, label: 'Uptime SLA', display: '99.9%', suffix: '%' },
    { value: 50, label: 'Script Load Time', display: '<50ms', prefix: '<', suffix: 'ms' }
];

const pricingTiers = [
    {
        name: 'Starter', price: 'Free', description: 'Perfect for side projects',
        features: ['1 website', '10k events/month', 'Basic analytics', '7-day retention'],
        cta: 'Get Started Free', highlighted: false
    },
    {
        name: 'Growth', price: '$39', period: '/month', description: 'For growing startups',
        features: ['5 websites', '250k events/month', 'Funnels & heatmaps', 'Session recordings', 'AI insights', '90-day retention'],
        cta: 'Start Free Trial', highlighted: true
    },
    {
        name: 'Pro', price: '$99', period: '/month', description: 'For agencies & teams',
        features: ['20 websites', '2M events/month', 'Advanced AI', 'Cross-domain analytics', '1-year retention', 'Priority support'],
        cta: 'Start Free Trial', highlighted: false
    }
];

const testimonials = [
    { quote: "TrackFlow helped us increase conversions by 40% in just 2 months. The funnel analytics are incredibly detailed.", author: "Sarah Chen", role: "Growth Lead at TechStartup", avatar: "SC", stars: 5 },
    { quote: "The AI insights are game-changing. It's like having a data scientist on the team, spotting trends we'd never catch.", author: "Marcus Johnson", role: "Founder of SaaSify", avatar: "MJ", stars: 5 },
    { quote: "Finally, analytics that respect user privacy without sacrificing features. Migration from GA took 10 minutes.", author: "Emily Rodriguez", role: "CTO at PrivacyFirst", avatar: "ER", stars: 5 }
];

const howItWorks = [
    { step: '1', title: 'Add One Script', description: 'Paste a single line of code into your website. Works with any framework — React, Next.js, WordPress, Shopify, and more.', icon: Code },
    { step: '2', title: 'Data Flows In', description: 'TrackFlow automatically captures pageviews, clicks, scrolls, sessions, and custom events. Zero configuration needed.', icon: Eye },
    { step: '3', title: 'Get Smart Insights', description: 'View real-time dashboards, conversion funnels, heatmaps, and AI-generated recommendations to grow faster.', icon: Brain },
];

const trustedBy = ['TechCorp', 'LaunchPad', 'ScaleUp', 'DataDriven', 'CloudFirst', 'InnovateCo'];

/* ─── MINI VISUALS FOR FEATURES ─── */

function MiniChart() {
    const bars = [35, 55, 42, 68, 52, 78, 62, 88, 72, 95];
    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '120px', padding: 'var(--space-md)' }}>
            {bars.map((h, i) => (
                <div key={i} style={{
                    flex: 1, height: `${h}%`,
                    background: '#F29F67',
                    borderRadius: '4px 4px 0 0', opacity: 0.6 + (i / bars.length) * 0.4,
                    animation: `barGrow 0.6s ease ${i * 0.08}s both`,
                    transformOrigin: 'bottom'
                }} />
            ))}
        </div>
    );
}

function MiniFunnel() {
    const steps = [{ w: 100, c: '#F29F67' }, { w: 72, c: '#E0B50F' }, { w: 45, c: '#34B1AA' }, { w: 28, c: '#3B8FF3' }];
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: 'var(--space-md)', alignItems: 'center' }}>
            {steps.map((s, i) => (
                <div key={i} style={{
                    width: `${s.w}%`, height: '28px', background: s.c, borderRadius: '6px',
                    opacity: 0.85, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', color: 'white', fontWeight: 600,
                    animation: `fadeInUp 0.5s ease ${i * 0.12}s both`
                }}>
                    {s.w}%
                </div>
            ))}
        </div>
    );
}

function MiniHeatmap() {
    const dots = [
        { x: 25, y: 20, s: 45, o: 0.9 }, { x: 60, y: 15, s: 55, o: 0.95 },
        { x: 45, y: 50, s: 40, o: 0.7 }, { x: 75, y: 40, s: 35, o: 0.6 },
        { x: 30, y: 70, s: 50, o: 0.85 }, { x: 55, y: 80, s: 30, o: 0.5 },
    ];
    return (
        <div style={{ position: 'relative', height: '140px', overflow: 'hidden', borderRadius: 'var(--radius-md)' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'var(--color-bg-tertiary)' }}>
                {[20, 40, 60, 80].map(y => <div key={y} style={{ position: 'absolute', left: '10%', right: '10%', top: `${y}%`, height: '8px', background: 'var(--color-bg-secondary)', borderRadius: '4px' }} />)}
            </div>
            {dots.map((d, i) => (
                <div key={i} style={{
                    position: 'absolute', left: `${d.x}%`, top: `${d.y}%`, transform: 'translate(-50%, -50%)',
                    width: `${d.s}px`, height: `${d.s}px`, borderRadius: '50%',
                    background: `radial-gradient(circle, rgba(255,${Math.round(80 * (1 - d.o))},${Math.round(50 * (1 - d.o))},${d.o * 0.7}) 0%, transparent 70%)`,
                    animation: `fadeIn 0.4s ease ${i * 0.1}s both`
                }} />
            ))}
        </div>
    );
}

function MiniRecording() {
    return (
        <div style={{ padding: 'var(--space-sm)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <Play size={14} style={{ color: '#3B8FF3' }} />
                <div style={{ flex: 1, height: '4px', background: 'var(--color-bg-secondary)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: '65%', height: '100%', background: '#3B8FF3', borderRadius: '2px' }} />
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>2:34</span>
            </div>
            {['/', '/pricing', '/checkout'].map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: i === 0 ? '#22c55e' : 'var(--color-border)' }} />
                    {p}
                    <span style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)', fontSize: '0.7rem' }}>{['0:00', '0:45', '1:22'][i]}</span>
                </div>
            ))}
        </div>
    );
}

function MiniAI() {
    const items = [
        { label: 'Traffic surge +42%', color: '#22c55e', icon: '📈' },
        { label: 'Bounce spike on /pricing', color: '#ef4444', icon: '⚠️' },
        { label: 'Opportunity: Product Hunt', color: '#F29F67', icon: '💡' },
    ];
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: 'var(--space-sm)' }}>
            {items.map((item, i) => (
                <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
                    background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)',
                    borderLeft: `3px solid ${item.color}`,
                    animation: `fadeInLeft 0.5s ease ${i * 0.15}s both`, fontSize: '0.8rem'
                }}>
                    <span>{item.icon}</span> {item.label}
                </div>
            ))}
        </div>
    );
}

function MiniDomains() {
    const domains = ['site-a.com', 'app.io', 'store.co'];
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: 'var(--space-sm)' }}>
            {domains.map((d, i) => (
                <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
                    background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)',
                    animation: `fadeInRight 0.4s ease ${i * 0.1}s both`
                }}>
                    <Globe size={14} style={{ color: '#E0B50F' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{d}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>{['12.4k', '8.2k', '5.1k'][i]} visits</span>
                </div>
            ))}
        </div>
    );
}

const featureVisuals: Record<string, React.ComponentType> = {
    chart: MiniChart, funnel: MiniFunnel, heatmap: MiniHeatmap,
    recording: MiniRecording, ai: MiniAI, domains: MiniDomains,
};

/* ─── SCROLL REVEAL HOOK ─── */

function useReveal() {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { el.classList.add('visible'); observer.unobserve(el); } },
            { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return ref;
}

function Reveal({ children, className = 'reveal', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
    const ref = useReveal();
    return <div ref={ref} className={className} style={style}>{children}</div>;
}

/* ─── ANIMATED COUNTER ─── */

function AnimatedStat({ stat }: { stat: typeof stats[0] }) {
    const [count, setCount] = useState(0);
    const [started, setStarted] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting && !started) { setStarted(true); observer.unobserve(el); } },
            { threshold: 0.5 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [started]);

    useEffect(() => {
        if (!started) return;
        const target = stat.value;
        const duration = 2000;
        const steps = 60;
        const increment = target / steps;
        let current = 0;
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) { setCount(target); clearInterval(timer); }
            else setCount(current);
        }, duration / steps);
        return () => clearInterval(timer);
    }, [started, stat.value]);

    const formatValue = () => {
        if (stat.label === 'Events Tracked Daily') return `${Math.round(count / 1000000)}M+`;
        if (stat.label === 'Happy Customers') return `${Math.round(count).toLocaleString()}+`;
        if (stat.label === 'Uptime SLA') return `${count.toFixed(1)}%`;
        if (stat.label === 'Script Load Time') return `<${Math.round(count)}ms`;
        return Math.round(count).toString();
    };

    return (
        <div ref={ref} style={{ textAlign: 'center' }}>
            <div style={{
                fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 800,
                color: '#f29f67',
                marginBottom: 'var(--space-xs)'
            }}>
                {started ? formatValue() : stat.display}
            </div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9375rem' }}>{stat.label}</div>
        </div>
    );
}

/* ─── MAIN COMPONENT ─── */

export default function HomePage() {
    const { theme, toggleTheme } = useTheme();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
            {/* ═══ NAVIGATION ═══ */}
            <nav style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
                background: 'var(--color-bg-card)',
                borderBottom: '1px solid var(--color-border)',
            }}>
                <div style={{
                    maxWidth: '1200px', margin: '0 auto', padding: '0 var(--space-lg)',
                    height: '72px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '6px',
                            background: '#f29f67', display: 'flex',
                            alignItems: 'center', justifyContent: 'center'
                        }}>
                            <BarChart3 size={20} color="white" />
                        </div>
                        <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>TrackFlow</span>
                    </div>

                    <div className="lp-nav-links">
                        {[{ label: 'Features', href: '#features' }, { label: 'Pricing', href: '#pricing' }, { label: 'Demo', href: '/demo' }].map(link => (
                            <Link key={link.label} href={link.href} style={{
                                color: 'var(--color-text-secondary)', textDecoration: 'none',
                                fontSize: '0.875rem', fontWeight: 500,
                            }}>{link.label}</Link>
                        ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                        <button onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                            style={{
                                padding: 'var(--space-sm)', background: 'var(--color-bg-tertiary)',
                                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                                color: 'var(--color-text-secondary)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                        </button>
                        <Link href="/login" style={{
                            padding: 'var(--space-sm) var(--space-md)', color: 'var(--color-text-secondary)',
                            textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500
                        }}>Login</Link>
                        <Link href="/register" style={{
                            padding: 'var(--space-sm) var(--space-lg)', background: '#f29f67',
                            color: 'white', textDecoration: 'none', borderRadius: 'var(--radius-md)',
                            fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 'var(--space-xs)'
                        }}>Get Started <ArrowRight size={16} /></Link>
                    </div>
                </div>
            </nav>

            {/* ═══ HERO ═══ */}
            <section style={{
                minHeight: '100vh', display: 'flex', alignItems: 'center',
                paddingTop: '72px', position: 'relative', overflow: 'hidden'
            }}>
                {/* No gradient background orbs — flat design */}

                <div style={{
                    maxWidth: '1200px', margin: '0 auto', padding: '0 var(--space-lg)',
                    textAlign: 'center', position: 'relative', zIndex: 1
                }}>
                    {/* Badge */}
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)',
                        padding: 'var(--space-xs) var(--space-md)',
                        background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)',
                        borderRadius: 'var(--radius-full)', color: 'var(--color-success)',
                        fontSize: '0.8125rem', fontWeight: 500, marginBottom: 'var(--space-xl)',
                        animation: 'fadeInUp 0.6s ease both'
                    }}>
                        <Rocket size={14} /> Now in Public Beta — Get 3 months free
                    </div>

                    {/* Headline */}
                    <h1 style={{
                        fontSize: 'clamp(2.5rem, 7vw, 4.5rem)', fontWeight: 800, lineHeight: 1.1,
                        marginBottom: 'var(--space-lg)', maxWidth: '900px', margin: '0 auto var(--space-lg)',
                        animation: 'fadeInUp 0.7s ease 0.1s both'
                    }}>
                        Understand Your Traffic.
                        <br />
                        <span style={{ color: '#f29f67' }}>
                            Grow Your Business.
                        </span>
                    </h1>

                    {/* Subheadline */}
                    <p style={{
                        fontSize: 'clamp(1rem, 2vw, 1.25rem)', color: 'var(--color-text-secondary)',
                        maxWidth: '650px', margin: '0 auto var(--space-xl)', lineHeight: 1.7,
                        animation: 'fadeInUp 0.7s ease 0.2s both'
                    }}>
                        All-in-one analytics with traffic tracking, conversion funnels, heatmaps,
                        session recordings, and AI-powered insights. One script, complete visibility.
                    </p>

                    {/* CTA Buttons */}
                    <div className="lp-cta-buttons" style={{ marginBottom: 'var(--space-2xl)', animation: 'fadeInUp 0.7s ease 0.3s both' }}>
                        <Link href="/register" style={{
                            padding: '1rem 2rem', background: '#f29f67', color: 'white',
                            textDecoration: 'none', borderRadius: 'var(--radius-md)', fontSize: '1rem',
                            fontWeight: 600, display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
                            transition: 'background 0.2s'
                        }}>Start Free <ArrowRight size={18} /></Link>
                        <Link href="/demo" style={{
                            padding: '1rem 2rem', background: 'var(--color-bg-card)',
                            border: '1px solid var(--color-border)', color: 'var(--color-text-primary)',
                            textDecoration: 'none', borderRadius: 'var(--radius-md)', fontSize: '1rem',
                            fontWeight: 500, display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
                        }}><Play size={18} /> View Live Demo</Link>
                    </div>

                    {/* Dashboard Preview */}
                    <div style={{
                        animation: 'fadeInUp 0.8s ease 0.5s both',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-xl)',
                        boxShadow: 'var(--shadow-md)',
                        maxWidth: '1000px', margin: '0 auto', overflow: 'hidden'
                    }}>
                        <div style={{
                            background: 'var(--color-bg-card)',
                            borderRadius: 'var(--radius-xl)',
                            padding: 'var(--space-md)', minHeight: '420px', display: 'flex', flexDirection: 'column'
                        }}>
                            {/* Window Chrome */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: 'var(--space-sm) var(--space-md)',
                                borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--space-md)'
                            }}>
                                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff5f57' }} />
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ffbd2e' }} />
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#28c940' }} />
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>demo-site.com — Dashboard</span>
                                <div />
                            </div>

                            {/* Stat Cards */}
                            <div className="lp-grid-4-stat" style={{ marginBottom: 'var(--space-lg)' }}>
                                {[
                                    { label: 'Visitors', value: '12,485', change: '+12%', icon: Users },
                                    { label: 'Pageviews', value: '48,320', change: '+8%', icon: BarChart3 },
                                    { label: 'Avg. Duration', value: '3m 24s', change: '+15%', icon: Clock },
                                    { label: 'Conversions', value: '2.4%', change: '+0.3%', icon: Target }
                                ].map((stat, i) => (
                                    <div key={i} style={{
                                        background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)',
                                        padding: 'var(--space-md)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-xs)' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>{stat.label}</span>
                                            <stat.icon size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                                        </div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '2px' }}>{stat.value}</div>
                                        <span style={{ fontSize: '0.6875rem', color: 'var(--color-success)' }}>{stat.change}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Chart Bars */}
                            <div style={{
                                flex: 1, background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)',
                                padding: 'var(--space-md)', display: 'flex', alignItems: 'flex-end', gap: '4px'
                            }}>
                                {Array.from({ length: 30 }, (_, i) => {
                                    const height = 30 + Math.sin(i * 0.3) * 20 + (i / 30) * 35;
                                    return (
                                        <div key={i} style={{
                                            flex: 1, height: `${height}%`,
                                            background: '#f29f67',
                                            borderRadius: '2px', opacity: 0.5 + (i / 30) * 0.5,
                                            animation: `barGrow 0.8s ease ${0.6 + i * 0.03}s both`,
                                            transformOrigin: 'bottom'
                                        }} />
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══ TRUSTED BY ═══ */}
            <Reveal style={{ padding: 'var(--space-2xl) 0', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 var(--space-lg)', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '2px', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-lg)', fontWeight: 600 }}>
                        Trusted by 5,000+ growing teams
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2xl)', flexWrap: 'wrap' }}>
                        {trustedBy.map((name, i) => (
                            <span key={i} style={{
                                fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-tertiary)',
                                opacity: 0.5, letterSpacing: '1px'
                            }}>{name}</span>
                        ))}
                    </div>
                </div>
            </Reveal>

            {/* ═══ FEATURES ═══ */}
            <section id="features" style={{ padding: 'var(--space-3xl) 0' }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 var(--space-lg)' }}>
                    <Reveal style={{ textAlign: 'center', marginBottom: 'var(--space-3xl)' }}>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-primary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 'var(--space-sm)' }}>Features</p>
                        <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 700, marginBottom: 'var(--space-md)' }}>
                            Everything You Need to Grow
                        </h2>
                        <p style={{ fontSize: '1.125rem', color: 'var(--color-text-secondary)', maxWidth: '550px', margin: '0 auto' }}>
                            From traffic analysis to AI predictions, get complete visibility into user behavior.
                        </p>
                    </Reveal>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3xl)' }}>
                        {features.map((feature, i) => {
                            const Icon = feature.icon;
                            const Visual = featureVisuals[feature.visual];
                            const isReversed = i % 2 === 1;
                            return (
                                <Reveal key={i} className={isReversed ? 'reveal-right' : 'reveal-left'}>
                                    <div className="lp-grid-features" style={{ direction: isReversed ? 'rtl' : 'ltr' }}>
                                        <div style={{ direction: 'ltr' }}>
                                            <div style={{
                                                width: '48px', height: '48px', borderRadius: '8px',
                                                background: feature.gradient, display: 'flex', alignItems: 'center',
                                                justifyContent: 'center', marginBottom: 'var(--space-lg)',
                                            }}>
                                                <Icon size={28} color="white" />
                                            </div>
                                            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--space-md)' }}>
                                                {feature.title}
                                            </h3>
                                            <p style={{ fontSize: '1rem', color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                                                {feature.description}
                                            </p>
                                            <Link href="/demo" style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)',
                                                marginTop: 'var(--space-lg)', color: 'var(--color-primary)',
                                                fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none'
                                            }}>
                                                See it in action <ArrowUpRight size={16} />
                                            </Link>
                                        </div>
                                        <div style={{
                                            direction: 'ltr',
                                            background: 'var(--color-bg-secondary)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-xl)',
                                            padding: 'var(--space-md)',
                                            minHeight: '200px',
                                        }}>
                                            <Visual />
                                        </div>
                                    </div>
                                </Reveal>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ═══ HOW IT WORKS ═══ */}
            <section style={{ padding: 'var(--space-3xl) 0', background: 'var(--color-bg-secondary)' }}>
                <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 var(--space-lg)' }}>
                    <Reveal style={{ textAlign: 'center', marginBottom: 'var(--space-2xl)' }}>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-primary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 'var(--space-sm)' }}>How it works</p>
                        <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 700, marginBottom: 'var(--space-md)' }}>
                            Up and Running in 5 Minutes
                        </h2>
                    </Reveal>

                    <div className="lp-grid-3" style={{ position: 'relative' }}>
                        {/* Connector Line */}
                        <div style={{
                            position: 'absolute', top: '52px', left: '20%', right: '20%', height: '1px',
                            background: 'var(--color-border)', zIndex: 0
                        }} />
                        {howItWorks.map((step, i) => {
                            const Icon = step.icon;
                            return (
                                <Reveal key={i} style={{ position: 'relative', zIndex: 1 }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{
                                            width: '64px', height: '64px', borderRadius: '50%',
                                            background: '#f29f67',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            margin: '0 auto var(--space-lg)',
                                        }}>
                                            <Icon size={28} />
                                        </div>
                                        <h4 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 'var(--space-sm)' }}>
                                            {step.title}
                                        </h4>
                                        <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
                                            {step.description}
                                        </p>
                                    </div>
                                </Reveal>
                            );
                        })}
                    </div>

                    {/* Script Preview */}
                    <Reveal style={{ marginTop: 'var(--space-2xl)' }}>
                        <div style={{
                            background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)', overflow: 'hidden',
                            maxWidth: '600px', margin: '0 auto'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                                <Terminal size={16} style={{ color: 'var(--color-primary)' }} />
                                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)' }}>Add to your HTML</span>
                            </div>
                            <pre style={{
                                fontFamily: 'var(--font-mono)', fontSize: '0.8125rem',
                                color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.8
                            }}>
                                <span style={{ color: 'var(--color-text-tertiary)' }}>&lt;</span>
                                <span style={{ color: '#F29F67' }}>script</span>
                                <span style={{ color: '#3B8FF3' }}> src</span>
                                <span style={{ color: 'var(--color-text-tertiary)' }}>=</span>
                                <span style={{ color: '#22c55e' }}>&quot;https://cdn.trackflow.io/t.js&quot;</span>
                                <span style={{ color: 'var(--color-text-tertiary)' }}>&gt;&lt;/</span>
                                <span style={{ color: '#F29F67' }}>script</span>
                                <span style={{ color: 'var(--color-text-tertiary)' }}>&gt;</span>
                            </pre>
                        </div>
                    </Reveal>
                </div>
            </section>

            {/* ═══ STATS ═══ */}
            <section style={{ padding: 'var(--space-3xl) 0', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 var(--space-lg)' }}>
                    <div className="lp-grid-3" style={{ maxWidth: '900px', margin: '0 auto' }}>
                        {stats.map((stat, i) => <AnimatedStat key={i} stat={stat} />)}
                    </div>
                </div>
            </section>

            {/* ═══ TESTIMONIALS ═══ */}
            <section style={{ padding: 'var(--space-3xl) 0', background: 'var(--color-bg-secondary)' }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 var(--space-lg)' }}>
                    <Reveal style={{ textAlign: 'center', marginBottom: 'var(--space-2xl)' }}>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-primary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 'var(--space-sm)' }}>Testimonials</p>
                        <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 700 }}>
                            Loved by Growing Teams
                        </h2>
                    </Reveal>

                    <div className="lp-grid-3">
                        {testimonials.map((t, i) => (
                            <Reveal key={i}>
                                <div style={{
                                    background: 'var(--color-bg-primary)', borderRadius: 'var(--radius-xl)',
                                    border: '1px solid var(--color-border)', padding: 'var(--space-xl)',
                                    transition: 'transform 0.3s, box-shadow 0.3s', cursor: 'default',
                                    height: '100%', display: 'flex', flexDirection: 'column'
                                }}>
                                    {/* Stars */}
                                    <div style={{ display: 'flex', gap: '2px', marginBottom: 'var(--space-md)' }}>
                                        {Array.from({ length: t.stars }).map((_, j) => (
                                            <Star key={j} size={16} fill="#f59e0b" color="#f59e0b" />
                                        ))}
                                    </div>
                                    <p style={{ fontSize: '1rem', lineHeight: 1.7, marginBottom: 'var(--space-lg)', flex: 1, fontStyle: 'italic', color: 'var(--color-text-primary)' }}>
                                        &quot;{t.quote}&quot;
                                    </p>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                                        <div style={{
                                            width: '44px', height: '44px', borderRadius: '50%',
                                            background: '#f29f67', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 600, fontSize: '0.875rem', color: 'white'
                                        }}>{t.avatar}</div>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{t.author}</div>
                                            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)' }}>{t.role}</div>
                                        </div>
                                    </div>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══ PRICING ═══ */}
            <section id="pricing" style={{ padding: 'var(--space-3xl) 0' }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 var(--space-lg)' }}>
                    <Reveal style={{ textAlign: 'center', marginBottom: 'var(--space-2xl)' }}>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-primary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 'var(--space-sm)' }}>Pricing</p>
                        <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 700, marginBottom: 'var(--space-md)' }}>
                            Simple, Transparent Pricing
                        </h2>
                        <p style={{ fontSize: '1.125rem', color: 'var(--color-text-secondary)' }}>
                            Start free, scale as you grow. No hidden fees.
                        </p>
                    </Reveal>

                    <div className="lp-grid-3" style={{ maxWidth: '1000px', margin: '0 auto' }}>
                        {pricingTiers.map((tier, i) => (
                            <Reveal key={i}>
                                <div style={{
                                    background: 'var(--color-bg-card)', borderRadius: 'var(--radius-lg)',
                                    border: tier.highlighted ? '2px solid #f29f67' : '1px solid var(--color-border)',
                                    padding: 'var(--space-xl)', position: 'relative',
                                    transition: 'transform 0.3s, box-shadow 0.3s'
                                }}>
                                    {tier.highlighted && (
                                        <div style={{
                                            position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
                                            background: '#f29f67', padding: '4px 16px',
                                            borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 600, color: 'white'
                                        }}>Most Popular</div>
                                    )}
                                    <h4 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 'var(--space-xs)' }}>{tier.name}</h4>
                                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)' }}>{tier.description}</p>
                                    <div style={{ marginBottom: 'var(--space-lg)' }}>
                                        <span style={{ fontSize: '3rem', fontWeight: 800 }}>{tier.price}</span>
                                        {tier.period && <span style={{ color: 'var(--color-text-tertiary)' }}>{tier.period}</span>}
                                    </div>
                                    <ul style={{ listStyle: 'none', padding: 0, marginBottom: 'var(--space-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                                        {tier.features.map((feature, idx) => (
                                            <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                                <Check size={16} style={{ color: 'var(--color-success)', flexShrink: 0 }} /> {feature}
                                            </li>
                                        ))}
                                    </ul>
                                    <Link href="/register" style={{
                                        display: 'block', textAlign: 'center', padding: 'var(--space-md)',
                                        background: tier.highlighted ? '#f29f67' : 'transparent',
                                        border: tier.highlighted ? 'none' : '1px solid var(--color-border)',
                                        borderRadius: 'var(--radius-md)', color: tier.highlighted ? 'white' : 'var(--color-text-primary)',
                                        textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem',
                                    }}>{tier.cta}</Link>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══ FINAL CTA ═══ */}
            <section style={{
                padding: 'var(--space-3xl) 0',
                background: 'var(--color-bg-secondary)',
                borderTop: '1px solid var(--color-border)'
            }}>
                <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 var(--space-lg)', textAlign: 'center', position: 'relative', zIndex: 1 }}>
                    <Reveal>
                        <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 700, marginBottom: 'var(--space-md)' }}>
                            Ready to Understand Your Users?
                        </h2>
                        <p style={{ fontSize: '1.125rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xl)' }}>
                            Join thousands of companies using TrackFlow to grow smarter.
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-md)' }}>
                            <Link href="/register" style={{
                                display: 'inline-flex', alignItems: 'center', gap: 'var(--space-sm)',
                                padding: '1rem 2.5rem', background: '#f29f67', color: 'white',
                                textDecoration: 'none', borderRadius: 'var(--radius-md)', fontSize: '1.125rem',
                                fontWeight: 600,
                            }}>Get Started Free <ArrowRight size={20} /></Link>
                        </div>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-sm)' }}>
                            <Lock size={14} /> No credit card required · Free forever plan available
                        </p>
                    </Reveal>
                </div>
            </section>

            {/* ═══ FOOTER ═══ */}
            <footer style={{ padding: 'var(--space-2xl) 0', borderTop: '1px solid var(--color-border)' }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 var(--space-lg)' }}>
                    <div className="lp-grid-footer" style={{ marginBottom: 'var(--space-2xl)' }}>
                        {/* Brand */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                                <div style={{
                                    width: '32px', height: '32px', borderRadius: '6px',
                                    background: '#f29f67', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <BarChart3 size={18} color="white" />
                                </div>
                                <span style={{ fontSize: '1.125rem', fontWeight: 700 }}>TrackFlow</span>
                            </div>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.7, maxWidth: '280px' }}>
                                Comprehensive analytics platform for tracking traffic, user behavior, and conversions with AI-powered insights.
                            </p>
                        </div>
                        {/* Links */}
                        {[
                            { title: 'Product', links: [{ label: 'Features', href: '#features' }, { label: 'Pricing', href: '#pricing' }, { label: 'Demo', href: '/demo' }, { label: 'Docs', href: '#' }] },
                            { title: 'Company', links: [{ label: 'About', href: '#' }, { label: 'Blog', href: '#' }, { label: 'Careers', href: '#' }, { label: 'Contact', href: '#' }] },
                            { title: 'Legal', links: [{ label: 'Privacy', href: '#' }, { label: 'Terms', href: '#' }, { label: 'GDPR', href: '#' }, { label: 'Security', href: '#' }] },
                        ].map((group, i) => (
                            <div key={i}>
                                <h5 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 'var(--space-md)', color: 'var(--color-text-primary)' }}>{group.title}</h5>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                                    {group.links.map((link, j) => (
                                        <Link key={j} href={link.href} style={{ color: 'var(--color-text-secondary)', textDecoration: 'none', fontSize: '0.875rem', transition: 'color 0.2s' }}>
                                            {link.label}
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ paddingTop: 'var(--space-lg)', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)' }}>
                            © 2024 TrackFlow. All rights reserved.
                        </p>
                        <div style={{ display: 'flex', gap: 'var(--space-lg)' }}>
                            <Link href="/demo" style={{ color: 'var(--color-text-tertiary)', textDecoration: 'none', fontSize: '0.8125rem' }}>Demo</Link>
                            <Link href="/login" style={{ color: 'var(--color-text-tertiary)', textDecoration: 'none', fontSize: '0.8125rem' }}>Login</Link>
                            <Link href="/register" style={{ color: 'var(--color-text-tertiary)', textDecoration: 'none', fontSize: '0.8125rem' }}>Register</Link>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
