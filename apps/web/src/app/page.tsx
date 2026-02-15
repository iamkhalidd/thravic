'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
    BarChart3,
    Target,
    MousePointer2,
    Video,
    Sparkles,
    Globe,
    ArrowRight,
    Check,
    Rocket,
    Play,
    Shield,
    Zap,
    TrendingUp,
    Users,
    Clock,
    ChevronRight,
    Sun,
    Moon
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

const features = [
    {
        icon: BarChart3,
        title: 'Traffic Analytics',
        description: 'Track visitors, sessions, and traffic sources with full UTM support.',
        gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)'
    },
    {
        icon: Target,
        title: 'Conversion Funnels',
        description: 'Build custom funnels and track drop-off rates at each step.',
        gradient: 'linear-gradient(135deg, #8b5cf6, #a855f7)'
    },
    {
        icon: MousePointer2,
        title: 'Click Heatmaps',
        description: 'Visualize where users click and scroll on your pages.',
        gradient: 'linear-gradient(135deg, #a855f7, #d946ef)'
    },
    {
        icon: Video,
        title: 'Session Recordings',
        description: 'Watch privacy-safe replays of user sessions.',
        gradient: 'linear-gradient(135deg, #d946ef, #ec4899)'
    },
    {
        icon: Sparkles,
        title: 'AI Insights',
        description: 'Get automated predictions and optimization suggestions.',
        gradient: 'linear-gradient(135deg, #ec4899, #f43f5e)'
    },
    {
        icon: Globe,
        title: 'Multi-Domain',
        description: 'Manage multiple websites from a single dashboard.',
        gradient: 'linear-gradient(135deg, #f43f5e, #6366f1)'
    }
];

const stats = [
    { value: '10M+', label: 'Events Tracked Daily' },
    { value: '5,000+', label: 'Happy Customers' },
    { value: '99.9%', label: 'Uptime SLA' },
    { value: '<50ms', label: 'Script Load Time' }
];

const pricingTiers = [
    {
        name: 'Starter',
        price: 'Free',
        description: 'Perfect for side projects',
        features: ['1 website', '10k events/month', 'Basic analytics', '7-day retention'],
        cta: 'Get Started Free',
        highlighted: false
    },
    {
        name: 'Growth',
        price: '$39',
        period: '/month',
        description: 'For growing startups',
        features: ['5 websites', '250k events/month', 'Funnels & heatmaps', 'Session recordings', 'AI insights', '90-day retention'],
        cta: 'Start Free Trial',
        highlighted: true
    },
    {
        name: 'Pro',
        price: '$99',
        period: '/month',
        description: 'For agencies & teams',
        features: ['20 websites', '2M events/month', 'Advanced AI', 'Cross-domain analytics', '1-year retention', 'Priority support'],
        cta: 'Start Free Trial',
        highlighted: false
    }
];

const testimonials = [
    {
        quote: "TrackFlow helped us increase conversions by 40% in just 2 months.",
        author: "Sarah Chen",
        role: "Growth Lead at TechStartup",
        avatar: "SC"
    },
    {
        quote: "The AI insights are game-changing. It's like having a data scientist on the team.",
        author: "Marcus Johnson",
        role: "Founder of SaaSify",
        avatar: "MJ"
    },
    {
        quote: "Finally, analytics that respect user privacy without sacrificing features.",
        author: "Emily Rodriguez",
        role: "CTO at PrivacyFirst",
        avatar: "ER"
    }
];

export default function HomePage() {
    const [currentTestimonial, setCurrentTestimonial] = useState(0);
    const { theme, toggleTheme } = useTheme();

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTestimonial(prev => (prev + 1) % testimonials.length);
        }, 5000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
            {/* Navigation */}
            <nav style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 50,
                background: 'rgba(10, 10, 15, 0.85)',
                backdropFilter: 'blur(20px)',
                borderBottom: '1px solid var(--color-border)'
            }}>
                <div style={{
                    maxWidth: '1200px',
                    margin: '0 auto',
                    padding: '0 var(--space-lg)',
                    height: '72px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--gradient-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <BarChart3 size={20} color="white" />
                        </div>
                        <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>TrackFlow</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
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
                                justifyContent: 'center'
                            }}
                        >
                            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                        </button>
                        <Link
                            href="/demo"
                            style={{
                                padding: 'var(--space-sm) var(--space-md)',
                                color: 'var(--color-text-secondary)',
                                textDecoration: 'none',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                transition: 'color 0.2s'
                            }}
                        >
                            Live Demo
                        </Link>
                        <Link
                            href="/login"
                            style={{
                                padding: 'var(--space-sm) var(--space-md)',
                                color: 'var(--color-text-secondary)',
                                textDecoration: 'none',
                                fontSize: '0.875rem',
                                fontWeight: 500
                            }}
                        >
                            Login
                        </Link>
                        <Link
                            href="/register"
                            style={{
                                padding: 'var(--space-sm) var(--space-lg)',
                                background: 'var(--gradient-primary)',
                                color: 'white',
                                textDecoration: 'none',
                                borderRadius: 'var(--radius-md)',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-xs)'
                            }}
                        >
                            Get Started <ArrowRight size={16} />
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                paddingTop: '72px',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Background Effects */}
                <div style={{
                    position: 'absolute',
                    top: '-20%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '140%',
                    height: '80%',
                    background: 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.15), transparent 70%)',
                    pointerEvents: 'none'
                }} />
                <div style={{
                    position: 'absolute',
                    bottom: '10%',
                    left: '10%',
                    width: '300px',
                    height: '300px',
                    background: 'radial-gradient(circle, rgba(168, 85, 247, 0.1), transparent 70%)',
                    pointerEvents: 'none'
                }} />

                <div style={{
                    maxWidth: '1200px',
                    margin: '0 auto',
                    padding: '0 var(--space-lg)',
                    textAlign: 'center',
                    position: 'relative',
                    zIndex: 1
                }}>
                    {/* Badge */}
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--space-xs)',
                        padding: 'var(--space-xs) var(--space-md)',
                        background: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        borderRadius: 'var(--radius-full)',
                        color: 'var(--color-success)',
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                        marginBottom: 'var(--space-xl)'
                    }}>
                        <Rocket size={14} />
                        Now in Public Beta — Get 3 months free
                    </div>

                    {/* Headline */}
                    <h1 style={{
                        fontSize: 'clamp(2.5rem, 7vw, 4.5rem)',
                        fontWeight: 800,
                        lineHeight: 1.1,
                        marginBottom: 'var(--space-lg)',
                        maxWidth: '900px',
                        margin: '0 auto var(--space-lg)'
                    }}>
                        Understand Your Traffic.
                        <br />
                        <span style={{
                            background: 'linear-gradient(135deg, #6366f1, #a855f7, #ec4899)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text'
                        }}>
                            Grow Your Business.
                        </span>
                    </h1>

                    {/* Subheadline */}
                    <p style={{
                        fontSize: '1.25rem',
                        color: 'var(--color-text-secondary)',
                        maxWidth: '650px',
                        margin: '0 auto var(--space-xl)',
                        lineHeight: 1.6
                    }}>
                        All-in-one analytics with traffic tracking, conversion funnels, heatmaps,
                        session recordings, and AI-powered insights. One script, complete visibility.
                    </p>

                    {/* CTA Buttons */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 'var(--space-md)',
                        marginBottom: 'var(--space-2xl)'
                    }}>
                        <Link
                            href="/register"
                            style={{
                                padding: '1rem 2rem',
                                background: 'var(--gradient-primary)',
                                color: 'white',
                                textDecoration: 'none',
                                borderRadius: 'var(--radius-lg)',
                                fontSize: '1rem',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-sm)',
                                boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)',
                                transition: 'transform 0.2s, box-shadow 0.2s'
                            }}
                        >
                            Start Free <ArrowRight size={18} />
                        </Link>
                        <Link
                            href="/demo"
                            style={{
                                padding: '1rem 2rem',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text-primary)',
                                textDecoration: 'none',
                                borderRadius: 'var(--radius-lg)',
                                fontSize: '1rem',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-sm)',
                                transition: 'background 0.2s'
                            }}
                        >
                            <Play size={18} /> View Live Demo
                        </Link>
                    </div>

                    {/* Dashboard Preview */}
                    <div style={{
                        padding: '3px',
                        background: 'linear-gradient(135deg, #6366f1, #a855f7, #ec4899)',
                        borderRadius: 'var(--radius-xl)',
                        boxShadow: '0 25px 80px -20px rgba(99, 102, 241, 0.5)',
                        maxWidth: '1000px',
                        margin: '0 auto'
                    }}>
                        <div style={{
                            background: 'var(--color-bg-secondary)',
                            borderRadius: 'calc(var(--radius-xl) - 2px)',
                            padding: 'var(--space-md)',
                            minHeight: '450px',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            {/* Mock Dashboard Header */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: 'var(--space-sm) var(--space-md)',
                                borderBottom: '1px solid var(--color-border)',
                                marginBottom: 'var(--space-md)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff5f57' }} />
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ffbd2e' }} />
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#28c940' }} />
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>demo-site.com — Dashboard</span>
                                <div />
                            </div>

                            {/* Mock Stats */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, 1fr)',
                                gap: 'var(--space-md)',
                                marginBottom: 'var(--space-lg)'
                            }}>
                                {[
                                    { label: 'Visitors', value: '12,485', change: '+12%', icon: Users },
                                    { label: 'Pageviews', value: '48,320', change: '+8%', icon: BarChart3 },
                                    { label: 'Avg. Duration', value: '3m 24s', change: '+15%', icon: Clock },
                                    { label: 'Conversions', value: '2.4%', change: '+0.3%', icon: Target }
                                ].map((stat, i) => (
                                    <div key={i} style={{
                                        background: 'var(--color-bg-tertiary)',
                                        borderRadius: 'var(--radius-md)',
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

                            {/* Mock Chart */}
                            <div style={{
                                flex: 1,
                                background: 'var(--color-bg-tertiary)',
                                borderRadius: 'var(--radius-md)',
                                padding: 'var(--space-md)',
                                display: 'flex',
                                alignItems: 'flex-end',
                                gap: '4px'
                            }}>
                                {Array.from({ length: 30 }, (_, i) => {
                                    const height = 30 + Math.sin(i * 0.3) * 20 + Math.random() * 30;
                                    return (
                                        <div
                                            key={i}
                                            style={{
                                                flex: 1,
                                                height: `${height}%`,
                                                background: 'linear-gradient(180deg, #6366f1, #a855f7)',
                                                borderRadius: '2px',
                                                opacity: 0.6 + (i / 30) * 0.4
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats Section */}
            <section style={{
                padding: 'var(--space-2xl) 0',
                background: 'var(--color-bg-secondary)',
                borderTop: '1px solid var(--color-border)',
                borderBottom: '1px solid var(--color-border)'
            }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 var(--space-lg)' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 'var(--space-xl)'
                    }}>
                        {stats.map((stat, i) => (
                            <div key={i} style={{ textAlign: 'center' }}>
                                <div style={{
                                    fontSize: '2.5rem',
                                    fontWeight: 800,
                                    background: 'var(--gradient-primary)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    marginBottom: 'var(--space-xs)'
                                }}>
                                    {stat.value}
                                </div>
                                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                                    {stat.label}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section style={{ padding: 'var(--space-3xl) 0' }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 var(--space-lg)' }}>
                    <div style={{ textAlign: 'center', marginBottom: 'var(--space-2xl)' }}>
                        <h2 style={{
                            fontSize: '2.5rem',
                            fontWeight: 700,
                            marginBottom: 'var(--space-md)'
                        }}>
                            Everything You Need to Grow
                        </h2>
                        <p style={{
                            fontSize: '1.125rem',
                            color: 'var(--color-text-secondary)',
                            maxWidth: '500px',
                            margin: '0 auto'
                        }}>
                            From traffic analysis to AI predictions, get complete visibility into user behavior.
                        </p>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 'var(--space-lg)'
                    }}>
                        {features.map((feature, i) => (
                            <div key={i} style={{
                                background: 'var(--color-bg-secondary)',
                                borderRadius: 'var(--radius-xl)',
                                border: '1px solid var(--color-border)',
                                padding: 'var(--space-xl)',
                                transition: 'transform 0.3s, box-shadow 0.3s',
                                cursor: 'default'
                            }}>
                                <div style={{
                                    width: '56px',
                                    height: '56px',
                                    borderRadius: 'var(--radius-lg)',
                                    background: feature.gradient,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: 'var(--space-lg)',
                                    boxShadow: '0 8px 20px rgba(99, 102, 241, 0.2)'
                                }}>
                                    <feature.icon size={28} color="white" />
                                </div>
                                <h4 style={{
                                    fontSize: '1.125rem',
                                    fontWeight: 600,
                                    marginBottom: 'var(--space-sm)'
                                }}>
                                    {feature.title}
                                </h4>
                                <p style={{
                                    fontSize: '0.9375rem',
                                    color: 'var(--color-text-secondary)',
                                    lineHeight: 1.6
                                }}>
                                    {feature.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Testimonials Section */}
            <section style={{
                padding: 'var(--space-3xl) 0',
                background: 'var(--color-bg-secondary)'
            }}>
                <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 var(--space-lg)', textAlign: 'center' }}>
                    <h2 style={{
                        fontSize: '2rem',
                        fontWeight: 700,
                        marginBottom: 'var(--space-2xl)'
                    }}>
                        Loved by Growing Teams
                    </h2>

                    <div style={{
                        background: 'var(--color-bg-primary)',
                        borderRadius: 'var(--radius-xl)',
                        border: '1px solid var(--color-border)',
                        padding: 'var(--space-2xl)',
                        minHeight: '200px'
                    }}>
                        <p style={{
                            fontSize: '1.25rem',
                            lineHeight: 1.6,
                            marginBottom: 'var(--space-xl)',
                            fontStyle: 'italic'
                        }}>
                            &quot;{testimonials[currentTestimonial].quote}&quot;
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-md)' }}>
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '50%',
                                background: 'var(--gradient-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 600
                            }}>
                                {testimonials[currentTestimonial].avatar}
                            </div>
                            <div style={{ textAlign: 'left' }}>
                                <div style={{ fontWeight: 600 }}>{testimonials[currentTestimonial].author}</div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                    {testimonials[currentTestimonial].role}
                                </div>
                            </div>
                        </div>

                        {/* Dots */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)' }}>
                            {testimonials.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setCurrentTestimonial(i)}
                                    style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        background: i === currentTestimonial ? 'var(--color-primary)' : 'var(--color-border)',
                                        border: 'none',
                                        cursor: 'pointer',
                                        transition: 'background 0.3s'
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section style={{ padding: 'var(--space-3xl) 0' }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 var(--space-lg)' }}>
                    <div style={{ textAlign: 'center', marginBottom: 'var(--space-2xl)' }}>
                        <h2 style={{
                            fontSize: '2.5rem',
                            fontWeight: 700,
                            marginBottom: 'var(--space-md)'
                        }}>
                            Simple, Transparent Pricing
                        </h2>
                        <p style={{
                            fontSize: '1.125rem',
                            color: 'var(--color-text-secondary)'
                        }}>
                            Start free, scale as you grow. No hidden fees.
                        </p>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 'var(--space-lg)',
                        maxWidth: '1000px',
                        margin: '0 auto'
                    }}>
                        {pricingTiers.map((tier, i) => (
                            <div
                                key={i}
                                style={{
                                    background: 'var(--color-bg-secondary)',
                                    borderRadius: 'var(--radius-xl)',
                                    border: tier.highlighted
                                        ? '2px solid var(--color-primary)'
                                        : '1px solid var(--color-border)',
                                    padding: 'var(--space-xl)',
                                    position: 'relative',
                                    boxShadow: tier.highlighted
                                        ? '0 20px 40px rgba(99, 102, 241, 0.2)'
                                        : 'none'
                                }}
                            >
                                {tier.highlighted && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '-12px',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        background: 'var(--gradient-primary)',
                                        padding: '4px 16px',
                                        borderRadius: 'var(--radius-full)',
                                        fontSize: '0.75rem',
                                        fontWeight: 600
                                    }}>
                                        Most Popular
                                    </div>
                                )}
                                <h4 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 'var(--space-xs)' }}>
                                    {tier.name}
                                </h4>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)' }}>
                                    {tier.description}
                                </p>
                                <div style={{ marginBottom: 'var(--space-lg)' }}>
                                    <span style={{ fontSize: '3rem', fontWeight: 800 }}>{tier.price}</span>
                                    {tier.period && <span style={{ color: 'var(--color-text-tertiary)' }}>{tier.period}</span>}
                                </div>
                                <ul style={{
                                    listStyle: 'none',
                                    padding: 0,
                                    marginBottom: 'var(--space-lg)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 'var(--space-sm)'
                                }}>
                                    {tier.features.map((feature, idx) => (
                                        <li key={idx} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 'var(--space-sm)',
                                            fontSize: '0.875rem',
                                            color: 'var(--color-text-secondary)'
                                        }}>
                                            <Check size={16} style={{ color: 'var(--color-success)' }} />
                                            {feature}
                                        </li>
                                    ))}
                                </ul>
                                <Link
                                    href="/register"
                                    style={{
                                        display: 'block',
                                        textAlign: 'center',
                                        padding: 'var(--space-md)',
                                        background: tier.highlighted ? 'var(--gradient-primary)' : 'transparent',
                                        border: tier.highlighted ? 'none' : '1px solid var(--color-border)',
                                        borderRadius: 'var(--radius-md)',
                                        color: 'var(--color-text-primary)',
                                        textDecoration: 'none',
                                        fontWeight: 600,
                                        fontSize: '0.875rem'
                                    }}
                                >
                                    {tier.cta}
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section style={{
                padding: 'var(--space-3xl) 0',
                background: 'linear-gradient(180deg, var(--color-bg-secondary), var(--color-bg-primary))'
            }}>
                <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 var(--space-lg)', textAlign: 'center' }}>
                    <h2 style={{
                        fontSize: '2.5rem',
                        fontWeight: 700,
                        marginBottom: 'var(--space-md)'
                    }}>
                        Ready to Understand Your Users?
                    </h2>
                    <p style={{
                        fontSize: '1.125rem',
                        color: 'var(--color-text-secondary)',
                        marginBottom: 'var(--space-xl)'
                    }}>
                        Join thousands of companies using TrackFlow to grow smarter.
                    </p>
                    <Link
                        href="/register"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 'var(--space-sm)',
                            padding: '1rem 2.5rem',
                            background: 'var(--gradient-primary)',
                            color: 'white',
                            textDecoration: 'none',
                            borderRadius: 'var(--radius-lg)',
                            fontSize: '1.125rem',
                            fontWeight: 600,
                            boxShadow: '0 8px 30px rgba(99, 102, 241, 0.4)'
                        }}
                    >
                        Get Started Free <ArrowRight size={20} />
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer style={{
                padding: 'var(--space-xl) 0',
                borderTop: '1px solid var(--color-border)'
            }}>
                <div style={{
                    maxWidth: '1200px',
                    margin: '0 auto',
                    padding: '0 var(--space-lg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                        <BarChart3 size={20} style={{ color: 'var(--color-primary)' }} />
                        <span style={{ fontWeight: 600 }}>TrackFlow</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)' }}>
                        <Link href="/demo" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none', fontSize: '0.875rem' }}>
                            Demo
                        </Link>
                        <Link href="/login" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none', fontSize: '0.875rem' }}>
                            Login
                        </Link>
                        <Link href="/register" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none', fontSize: '0.875rem' }}>
                            Register
                        </Link>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-tertiary)' }}>
                        © 2024 TrackFlow. All rights reserved.
                    </p>
                </div>
            </footer>
        </div>
    );
}
