'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { BarChart3, ArrowLeft, Mail, MapPin, Send, MessageSquare, ChevronDown } from 'lucide-react';

const s = {
    page: { minHeight: '100vh', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', padding: '80px 24px' },
    container: { maxWidth: '1000px', margin: '0 auto' },
    header: { marginBottom: '64px', textAlign: 'center' as const },
    h1: { fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 600, letterSpacing: '-0.04em', marginBottom: '16px' },
    subtitle: { fontSize: '1.125rem', color: 'var(--color-text-secondary)', maxWidth: '600px', margin: '0 auto', lineHeight: 1.6 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '48px', marginTop: '40px' },
    card: { background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--color-border)', borderRadius: '20px', padding: '32px', display: 'flex', flexDirection: 'column' as const, gap: '24px' },
    formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '8px', marginBottom: '20px' },
    label: { fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-secondary)' },
    input: { background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '12px 16px', color: 'var(--color-text-primary)', fontSize: '0.9375rem', outline: 'none', transition: 'border-color 0.2s' },
    selectWrapper: { position: 'relative' as const },
    select: { width: '100%', appearance: 'none' as const, background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '12px 16px', color: 'var(--color-text-primary)', fontSize: '0.9375rem', outline: 'none', cursor: 'pointer' },
    infoItem: { display: 'flex', gap: '16px', alignItems: 'flex-start' },
    iconBox: { width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
};

export default function ContactPage() {
    const [formState, setFormState] = useState({ name: '', email: '', type: 'Technical Support', subject: '', message: '' });
    const [isSubmitted, setIsSubmitted] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitted(true);
        // In a real app, you'd send this to your API
    };

    if (isSubmitted) {
        return (
            <div style={s.page}>
                <div style={{ ...s.container, textAlign: 'center', paddingTop: '100px' }}>
                    <div style={{ width: '80px', height: '80px', background: 'var(--color-accent-primary)', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 32px' }}>
                        <Send size={40} color="white" />
                    </div>
                    <h1 style={s.h1}>Message Sent!</h1>
                    <p style={s.subtitle}>Thanks for reaching out. Our team will review your inquiry and get back to you as soon as possible.</p>
                    <Link href="/" className="btn-primary" style={{ marginTop: '40px', display: 'inline-flex', padding: '12px 32px', borderRadius: '999px', textDecoration: 'none' }}>
                        Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div style={s.page}>
            <div className="linear-hero-grid" style={{ opacity: 0.1 }}></div>
            
            <div style={s.container}>
                <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)', textDecoration: 'none', fontSize: '0.875rem', marginBottom: '40px' }}>
                    <ArrowLeft size={16} /> Back to Home
                </Link>

                <header style={s.header}>
                    <h1 style={s.h1}>Get in Touch with Thravic</h1>
                    <p style={s.subtitle}>
                        Whether you're scaling your first startup or optimizing a high-growth enterprise, we’re here to help you unlock the full potential of your web traffic.
                    </p>
                </header>

                <div style={s.grid}>
                    {/* Contact Info */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        <div style={s.card}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <MessageSquare size={20} color="var(--color-accent-primary)" /> Contact Details
                            </h3>
                            
                            <div style={s.infoItem}>
                                <div style={s.iconBox}><Mail size={18} /></div>
                                <div>
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>General Support</div>
                                    <div style={{ fontWeight: 500 }}>support@thravic.com</div>
                                </div>
                            </div>

                            <div style={s.infoItem}>
                                <div style={s.iconBox}><Mail size={18} /></div>
                                <div>
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Sales & Partnerships</div>
                                    <div style={{ fontWeight: 500 }}>partners@thravic.com</div>
                                </div>
                            </div>

                            <div style={s.infoItem}>
                                <div style={s.iconBox}><MapPin size={18} /></div>
                                <div>
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Office Address</div>
                                    <div style={{ fontWeight: 500, lineHeight: 1.5 }}>
                                        123 Tech Innovation Way<br />
                                        Floor 4, Silicon Quarter<br />
                                        London, EC1V 4AD, UK
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ ...s.card, background: 'var(--gradient-primary)', color: 'var(--color-bg-primary)', border: 'none' }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Need answers fast?</h3>
                            <p style={{ fontSize: '0.9375rem', opacity: 0.8, lineHeight: 1.6 }}>
                                Check our documentation or join our community Discord to get help from fellow developers and the Thravic team.
                            </p>
                            <Link href="#" style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline', fontSize: '0.875rem' }}>Visit Help Center</Link>
                        </div>
                    </div>

                    {/* Contact Form */}
                    <div style={s.card}>
                        <form onSubmit={handleSubmit}>
                            <div style={s.formGroup}>
                                <label style={s.label}>Full Name</label>
                                <input required style={s.input} placeholder="Your Name" value={formState.name} onChange={e => setFormState({...formState, name: e.target.value})} />
                            </div>

                            <div style={s.formGroup}>
                                <label style={s.label}>Company Email</label>
                                <input required type="email" style={s.input} placeholder="work@company.com" value={formState.email} onChange={e => setFormState({...formState, email: e.target.value})} />
                            </div>

                            <div style={s.formGroup}>
                                <label style={s.label}>Inquiry Type</label>
                                <div style={s.selectWrapper}>
                                    <select style={s.select} value={formState.type} onChange={e => setFormState({...formState, type: e.target.value})}>
                                        <option>Technical Support</option>
                                        <option>Sales & Enterprise Pricing</option>
                                        <option>Business Partnerships</option>
                                        <option>Other</option>
                                    </select>
                                    <ChevronDown size={16} style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5 }} />
                                </div>
                            </div>

                            <div style={s.formGroup}>
                                <label style={s.label}>Subject</label>
                                <input required style={s.input} placeholder="Briefly describe your request" value={formState.subject} onChange={e => setFormState({...formState, subject: e.target.value})} />
                            </div>

                            <div style={s.formGroup}>
                                <label style={s.label}>Message</label>
                                <textarea required style={{ ...s.input, minHeight: '120px', resize: 'vertical' }} placeholder="How can we help you?" value={formState.message} onChange={e => setFormState({...formState, message: e.target.value})} />
                            </div>

                            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '14px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.9375rem' }}>
                                <Send size={16} /> Send Message
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
