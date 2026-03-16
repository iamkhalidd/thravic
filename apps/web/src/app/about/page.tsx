'use client';

import React from 'react';
import Link from 'next/link';
import { BarChart3, ArrowLeft, Rocket, Target, Sparkles, Users, ArrowRight } from 'lucide-react';

const s = {
    page: { minHeight: '100vh', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', padding: '80px 24px' },
    container: { maxWidth: '800px', margin: '0 auto' },
    header: { marginBottom: '80px', textAlign: 'center' as const },
    h1: { fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 600, letterSpacing: '-0.04em', marginBottom: '24px' },
    subtitle: { fontSize: '1.25rem', color: 'var(--color-text-secondary)', maxWidth: '600px', margin: '0 auto', lineHeight: 1.6 },
    section: { marginBottom: '80px' },
    h2: { fontSize: '1.75rem', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' },
    p: { fontSize: '1.0625rem', color: 'var(--color-text-secondary)', lineHeight: 1.8, marginBottom: '24px' },
    cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '48px' },
    card: { background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--color-border)', borderRadius: '20px', padding: '32px', transition: 'transform 0.2s, border-color 0.2s' },
};

export default function AboutPage() {
    return (
        <div style={s.page}>
            <div className="linear-hero-grid" style={{ opacity: 0.2 }}></div>
            
            <div style={s.container}>
                <Link href="/" style={{ 
                    display: 'inline-flex', alignItems: 'center', gap: '8px', 
                    color: 'var(--color-text-secondary)', textDecoration: 'none', 
                    fontSize: '0.875rem', marginBottom: '48px', transition: 'color 0.2s' 
                }} className="hover-link">
                    <ArrowLeft size={16} /> Back to Home
                </Link>

                <header style={s.header}>
                    <div className="linear-pill" style={{ marginBottom: '24px' }}>
                        <Sparkles size={12} style={{ color: 'var(--color-text-muted)' }} />
                        <span>Our Mission</span>
                    </div>
                    <h1 style={s.h1}>Empowering the next generation of <span className="text-gradient">innovators.</span></h1>
                    <p style={s.subtitle}>
                        Thravic was built on a simple premise: clarity drives growth. We help startups and businesses turn raw data into actionable strategy.
                    </p>
                </header>

                <section style={s.section}>
                    <h2 style={s.h2}><Target size={28} color="var(--color-accent-primary)" /> Clarity Above All</h2>
                    <p style={s.p}>
                        In the fast-paced world of startups, data is often abundant but insights are scarce. Our core mission is to bridge that gap. We provide businesses with a lens to see exactly where their traffic is coming from—whether it's an organic surge from Google, a viral campaign on Instagram, or a strategic partnership.
                    </p>
                    <p style={s.p}>
                        By identifying these high-value sources, we empower founders and marketing teams to double down on what works and cut out the noise.
                    </p>
                </section>

                <div style={s.cardGrid}>
                    <div style={s.card}>
                        <div style={{ marginBottom: '20px', color: '#34B1AA' }}><Rocket size={32} /></div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '12px' }}>Built for Speed</h3>
                        <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                            In a startup, every second counts. Thravic is optimized for performance, delivering real-time insights without slowing down your site.
                        </p>
                    </div>
                    <div style={s.card}>
                        <div style={{ marginBottom: '20px', color: '#f59e0b' }}><Users size={32} /></div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '12px' }}>Crowd-Powered Decisions</h3>
                        <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                            Understand user behavior through visual funnels and heatmaps. Make decisions based on how real people interact with your product.
                        </p>
                    </div>
                </div>

                <section style={s.section}>
                    <h2 style={s.h2}>Beyond Just Numbers</h2>
                    <p style={s.p}>
                        We believe that analytics shouldn't just be about counting clicks. It's about understanding the journey. Thravic allows you to create sophisticated conversion funnels that map out the path from first-time visitor to loyal customer.
                    </p>
                    <p style={s.p}>
                        Our professional, innovative platform is designed to be your secondary co-founder—the one that provides the cold, hard facts you need to make the pivots that matter.
                    </p>
                </section>

                <div style={{ 
                    marginTop: '100px', padding: '64px', background: 'var(--gradient-primary)', 
                    borderRadius: '24px', textAlign: 'center', position: 'relative', overflow: 'hidden' 
                }}>
                    <div style={{ position: 'relative', zIndex: 1 }}>
                        <h2 style={{ fontSize: '2rem', fontWeight: 600, marginBottom: '16px', color: 'var(--color-bg-primary)' }}>Join the movement.</h2>
                        <p style={{ color: 'rgba(0,0,0,0.7)', marginBottom: '32px', fontSize: '1.125rem' }}>Start making data-driven decisions today.</p>
                        <Link href="/register" className="btn-primary" style={{ 
                            background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', 
                            padding: '12px 32px', borderRadius: '999px', textDecoration: 'none', 
                            fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px' 
                        }}>
                            Get Started Free <ArrowRight size={18} />
                        </Link>
                    </div>
                </div>

                <footer style={{ marginTop: '80px', textAlign: 'center' }}>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                        © {new Date().getFullYear()} Thravic. Innovative analytics for the modern web.
                    </p>
                </footer>
            </div>
        </div>
    );
}
