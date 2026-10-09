'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ThemedLogo } from '@/components/ThemedLogo';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { auth } from '@/lib/api';
import { CountrySelect } from '@/components/CountrySelect';
import { countryError, dateOfBirthError, latestAdultBirthDate, phoneError } from '@/lib/profile';

const labelStyle = {
    display: 'block',
    marginBottom: 'var(--space-xs)',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
} as const;

type View = 'loading' | 'form' | 'restricted' | 'deleted';

/**
 * Where accounts without the required profile land (Google/GitHub sign-ups and
 * accounts from before these fields existed), and where a restricted account
 * is told why. The dashboard sends people here until the profile is complete.
 */
export default function CompleteProfilePage() {
    const router = useRouter();
    const [view, setView] = useState<View>('loading');
    const [hasDateOfBirth, setHasDateOfBirth] = useState(false);
    const [form, setForm] = useState({ name: '', dateOfBirth: '', country: '', phone: '' });
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!auth.isAuthenticated()) {
            router.replace('/login');
            return;
        }
        auth.getMe().then(({ data }) => {
            if (!data) {
                router.replace('/login');
                return;
            }
            if (data.restricted) {
                setView('restricted');
                return;
            }
            if (data.profile_complete) {
                router.replace('/dashboard');
                return;
            }
            setHasDateOfBirth(!!data.date_of_birth);
            setForm({
                name: data.name || '',
                dateOfBirth: data.date_of_birth || '',
                // Values saved before these checks (free-text country, local phone) start empty.
                country: data.missing_fields.includes('country') ? '' : data.country || '',
                phone: data.phone || '',
            });
            setView('form');
        });
    }, [router]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const problem = (form.name.trim().length < 2 ? 'Enter your full name' : null)
            || (hasDateOfBirth ? null : dateOfBirthError(form.dateOfBirth))
            || countryError(form.country)
            || phoneError(form.phone);
        if (problem) {
            setError(problem);
            return;
        }

        setSaving(true);
        setError('');
        const { data, error: failed, details } = await auth.updateProfile({
            name: form.name,
            country: form.country,
            phone: form.phone,
            ...(hasDateOfBirth ? {} : { date_of_birth: form.dateOfBirth }),
        });
        setSaving(false);

        if (details?.accountDeleted) {
            auth.clearSession();
            setView('deleted');
        } else if (details?.restricted) {
            setView('restricted');
        } else if (failed) {
            setError(failed);
        } else if (data) {
            router.replace('/dashboard');
        }
    };

    const logout = async () => {
        await auth.logout();
        router.replace('/login');
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', padding: '16px' }}>
            <div style={{ width: '100%', maxWidth: '440px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-xl)' }}>
                    <ThemedLogo height={34} />
                </div>

                <div className="card" style={{ padding: 'var(--space-xl)' }}>
                    {view === 'loading' && <div className="loading" style={{ padding: '2rem' }}><div className="spinner" /></div>}

                    {view === 'restricted' && (
                        <div style={{ textAlign: 'center' }}>
                            <ShieldAlert size={36} style={{ color: '#f59e0b', marginBottom: 'var(--space-md)' }} />
                            <h1 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-sm)' }}>This account is restricted</h1>
                            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--space-md)' }}>
                                Thravic is only for people aged 18 or older. The dashboard is locked and this
                                account&apos;s sites have stopped collecting data. The account and its data will be
                                deleted after 30 days.
                            </p>
                            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--space-lg)' }}>
                                If your date of birth was entered by mistake, contact support and we&apos;ll correct it.
                            </p>
                            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'center' }}>
                                <Link href="/contact" className="btn btn-primary">Contact support</Link>
                                <button type="button" className="btn btn-secondary" onClick={logout}>Log out</button>
                            </div>
                        </div>
                    )}

                    {view === 'deleted' && (
                        <div style={{ textAlign: 'center' }}>
                            <ShieldAlert size={36} style={{ color: '#f59e0b', marginBottom: 'var(--space-md)' }} />
                            <h1 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-sm)' }}>We can&apos;t open an account for you</h1>
                            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--space-lg)' }}>
                                Thravic is only for people aged 18 or older, so this account has been removed.
                            </p>
                            <Link href="/" className="btn btn-secondary">Back to home</Link>
                        </div>
                    )}

                    {view === 'form' && (
                        <form onSubmit={submit} noValidate>
                            <h1 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-xs)' }}>Finish setting up your account</h1>
                            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: 'var(--space-lg)' }}>
                                We need a few details before you continue. Thravic is for people aged 18 or older.
                            </p>

                            {error && (
                                <div role="alert" style={{ marginBottom: 'var(--space-md)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.875rem', background: 'rgba(255,85,85,0.1)', color: '#ff5555', borderLeft: '3px solid #ff5555' }}>
                                    {error}
                                </div>
                            )}

                            <div style={{ marginBottom: 'var(--space-md)' }}>
                                <label htmlFor="cp-name" style={labelStyle}>Full name</label>
                                <input id="cp-name" className="input" value={form.name} autoComplete="name"
                                    onChange={e => setForm({ ...form, name: e.target.value })} required />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                                <div>
                                    <label htmlFor="cp-dob" style={labelStyle}>Date of birth</label>
                                    <input id="cp-dob" type="date" className="input" value={form.dateOfBirth}
                                        max={latestAdultBirthDate()} disabled={hasDateOfBirth}
                                        onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} required />
                                </div>
                                <div>
                                    <label htmlFor="cp-country" style={labelStyle}>Country</label>
                                    <CountrySelect id="cp-country" value={form.country} onChange={country => setForm({ ...form, country })} required />
                                </div>
                            </div>

                            <div style={{ marginBottom: 'var(--space-lg)' }}>
                                <label htmlFor="cp-phone" style={labelStyle}>Phone number</label>
                                <input id="cp-phone" type="tel" className="input" placeholder="+234 803 123 4567" autoComplete="tel"
                                    value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>Include your country code.</div>
                            </div>

                            <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%' }}>
                                {saving ? 'Saving…' : 'Continue'}
                            </button>
                            <button type="button" onClick={logout} style={{ display: 'block', margin: 'var(--space-md) auto 0', background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '0.8125rem', cursor: 'pointer' }}>
                                Log out
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
