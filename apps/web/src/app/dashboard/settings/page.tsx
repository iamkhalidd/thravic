'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { UsageMeters } from '@/components/UsageMeters';
import { CountrySelect } from '@/components/CountrySelect';
import { countryError, phoneError, websiteError } from '@/lib/profile';
import { shortDate, type BillingState, type UsageMeter as UsageMeterData } from '@/lib/usage';
import {
    Shield,
    Download,
    Tag,
    Trash2,
    Save,
    Check,
    Crown,
    Loader,
    AlertCircle,
    X,
    Mail,
} from 'lucide-react';
import { auth, exportData, formatPlanPrice, payments, planPeriod, type ExportType } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';

// Marketing copy for each plan. Names and prices are replaced by the API's
// (the price checkout actually charges); these values are only the fallback.
const fallbackPlans: Array<{ id: string; name: string; price: number; currency: string; interval: string; features: string[] }> = [
    {
        id: 'free',
        name: 'Hobby',
        price: 0,
        currency: 'NGN',
        interval: 'monthly',
        features: ['1 domain', '5,000 events/mo', '30-day history', 'Core analytics & UTM'],
    },
    {
        id: 'pro',
        name: 'Pro',
        price: 45000,
        currency: 'NGN',
        interval: 'monthly',
        features: ['3 domains', '100,000 events/mo', '1-year history', 'Heatmaps & recordings', 'Funnels & AI insights', 'CSV export & team'],
    },
    {
        id: 'agency',
        name: 'Agency',
        price: 125000,
        currency: 'NGN',
        interval: 'monthly',
        features: ['20 domains', '500,000 events/mo', '2-year history', 'Everything in Pro', 'Unlimited team members', 'Priority support'],
    },
];

interface UserData {
    id: string;
    name: string;
    email: string;
    subscription: string;
    auth_provider?: string;
    avatar_url?: string;
    company?: string | null;
    job_title?: string | null;
    website?: string | null;
    phone?: string | null;
    date_of_birth?: string | null;
    country?: string | null;
    timezone?: string | null;
    createdAt?: string;
}

function SettingsPageInner() {
    const searchParams = useSearchParams();

    const [user, setUser] = useState<UserData | null>(null);
    const [activeTab, setActiveTab] = useState<'account' | 'subscription' | 'notifications' | 'export'>('account');
    const [loading, setLoading] = useState(true);
    const [plans, setPlans] = useState(fallbackPlans);
    const [meters, setMeters] = useState<UsageMeterData[] | null>(null);
    const [current, setCurrent] = useState<BillingState | null>(null);
    const { selectedDomainId } = useDomain();
    const [exportError, setExportError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [avatarUploading, setAvatarUploading] = useState(false);

    // Notifications state
    const [notifications, setNotifications] = useState({
        weeklyReport: true,
        trafficAlerts: true,
        insightAlerts: true,
        productUpdates: false,
    });

    // Form states
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [company, setCompany] = useState('');
    const [jobTitle, setJobTitle] = useState('');
    const [website, setWebsite] = useState('');
    const [phone, setPhone] = useState('');
    const [country, setCountry] = useState('');
    const [timezone, setTimezone] = useState('');

    // Upgrade state
    const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);
    const [upgradeError, setUpgradeError] = useState<string | null>(null);
    const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null); // plan name after success

    // Promo code state
    const [promoCode, setPromoCode] = useState('');
    const [promoResult, setPromoResult] = useState<{
        valid: boolean; discount_type?: string; discount_value?: number;
        original_price?: number; discounted_price?: number; currency?: string; error?: string;
    } | null>(null);
    const [validatingPromo, setValidatingPromo] = useState(false);
    const [showPromoInput, setShowPromoInput] = useState(false);

    // Load data
    const loadData = useCallback(async () => {
        const userRes = await auth.getMe();
        if (userRes.data) {
            setUser(userRes.data as UserData);
            setName(userRes.data.name || '');
            setEmail(userRes.data.email || '');
            setCompany(userRes.data.company || '');
            setJobTitle(userRes.data.job_title || '');
            setWebsite(userRes.data.website || '');
            setPhone(userRes.data.phone || '');
            setCountry(userRes.data.country || '');
            setTimezone(userRes.data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || '');
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        payments.getUsage().then(({ data }) => {
            if (data?.usage?.meters) setMeters(data.usage.meters);
        });
        payments.getCurrent().then(({ data }) => {
            if (data?.subscription) setCurrent(data.subscription);
        });
    }, []);

    useEffect(() => {
        // Every plan for sale, as the admin defined it; the built-in list is only
        // the fallback if the API can't be reached.
        payments.getPlans().then(({ data }) => {
            if (!data?.plans?.length) return;
            setPlans(data.plans.map(live => ({
                id: live.id,
                name: live.name,
                price: live.price,
                currency: live.currency ?? 'NGN',
                interval: live.interval ?? 'monthly',
                features: live.bullets ?? [],
            })));
        });
    }, []);

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'subscription' || tab === 'notifications' || tab === 'export') setActiveTab(tab);
    }, [searchParams]);

    useEffect(() => {
        const paymentStatus = searchParams.get('payment');
        const reference = searchParams.get('reference');

        if (paymentStatus === 'success' && reference) {
            setActiveTab('subscription');
            (async () => {
                const result = await payments.verify(reference);
                if (result) {
                    setPaymentSuccess(result.plan);
                    const userRes = await auth.getMe();
                    if (userRes.data) setUser(userRes.data as UserData);
                } else {
                    setUpgradeError('Payment verification failed. Please contact support if your account was charged.');
                }
                const url = new URL(window.location.href);
                url.searchParams.delete('payment');
                url.searchParams.delete('reference');
                window.history.replaceState({}, '', url.toString());
            })();
        }
    }, [searchParams]);

    const validatePromo = async (planId: string) => {
        if (!promoCode.trim()) { setPromoResult(null); return; }
        setValidatingPromo(true);
        try {
            const result = await payments.validatePromo(promoCode, planId);
            setPromoResult(result);
        } catch {
            setPromoResult({ valid: false, error: 'Failed to validate code' });
        } finally { setValidatingPromo(false); }
    };

    const handleUpgrade = async (planId: string) => {
        setUpgradeError(null);
        setUpgradingPlan(planId);
        try {
            const result = await payments.checkout(planId, promoResult?.valid ? promoCode : undefined);
            if (result?.checkoutUrl) {
                window.location.href = result.checkoutUrl;
            } else {
                setUpgradeError(result?.error || 'Something went wrong. Please try again later or contact support.');
                setUpgradingPlan(null);
            }
        } catch (err: any) {
            setUpgradeError('Checkout failed. Please check your network or payment details and try again.');
            setUpgradingPlan(null);
        }
    };

    const handleSaveProfile = async () => {
        const problem = (name.trim().length < 2 ? 'Enter your full name' : null)
            || countryError(country) || phoneError(phone) || websiteError(website);
        setProfileError(problem);
        if (problem) return;
        setSaving(true);
        try {
            const res = await auth.updateProfile({
                name, company, job_title: jobTitle, website, phone, country, timezone
            });
            if (res.error) setProfileError(res.error);
            if (res.data) {
                setUser(prev => prev ? { ...prev, ...res.data as any } : null);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
            }
        } catch (e) {
            console.error('Failed to save profile', e);
        } finally {
            setSaving(false);
        }
    };

    const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setAvatarUploading(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
            const result = await auth.uploadAvatar(reader.result as string);
            if (result.data) {
                setUser(prev => prev ? { ...prev, avatar_url: result.data!.avatar_url } : null);
            }
            setAvatarUploading(false);
        };
        reader.readAsDataURL(file);
    };

    const handleAvatarRemove = async () => {
        setAvatarUploading(true);
        const result = await auth.removeAvatar();
        if (result.data) {
            setUser(prev => prev ? { ...prev, avatar_url: result.data!.avatar_url } : null);
        }
        setAvatarUploading(false);
    };

    const handleExport = async (type: ExportType) => {
        if (!selectedDomainId) return;
        setExportError(null);
        const result = await exportData.downloadCsv(selectedDomainId, type);
        if (result.error) setExportError(result.error);
    };

    const tabs = [
        { id: 'account', label: 'Account' },
        { id: 'subscription', label: 'Plan & usage' },
        { id: 'notifications', label: 'Notifications' },
        { id: 'export', label: 'Export data' },
    ] as const;

    if (loading) {
        return (
            <div className="page-stack">
                <div className="skeleton" style={{ height: '28px', width: '180px' }} />
                <div className="skeleton" style={{ height: '34px', width: '420px', maxWidth: '100%' }} />
                <div className="card">
                    <div className="skeleton" style={{ height: '400px' }} />
                </div>
            </div>
        );
    }

    // The plan in force (a lapsed paid plan is free), not the plan last bought.
    const currentPlan = current?.plan || user?.subscription || 'free';
    const avatarSrc = user?.avatar_url?.startsWith('/uploads')
        ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${user.avatar_url}`
        : user?.avatar_url;

    return (
        <div className="page-stack">
            <PageHeader title="Settings" subtitle="Your account, plan, notifications and data exports." />

            <div className="segmented" role="tablist" aria-label="Settings sections" style={{ alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        id={`settings-tab-${tab.id}`}
                        aria-selected={activeTab === tab.id}
                        aria-controls="settings-panel"
                        onClick={() => setActiveTab(tab.id)}
                        style={{ whiteSpace: 'nowrap' }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`} className="page-stack">

                {/* ── Account Tab ── */}
                {activeTab === 'account' && (
                    <>
                        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            {/* Avatar */}
                            <section>
                                <h2 style={sectionTitle}>Profile picture</h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                                    <div style={{ position: 'relative' }}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={avatarSrc}
                                            alt={user?.name || 'User'}
                                            style={{
                                                width: '56px', height: '56px', borderRadius: '50%',
                                                objectFit: 'cover', border: '1px solid var(--color-border)',
                                                opacity: avatarUploading ? 0.5 : 1
                                            }}
                                        />
                                        {avatarUploading && (
                                            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                                                <Loader size={18} className="spin" color="var(--color-text-primary)" />
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <div>
                                            <input type="file" id="avatarUpload" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
                                            <label htmlFor="avatarUpload" className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                                                Change
                                            </label>
                                        </div>
                                        <button onClick={handleAvatarRemove} className="btn btn-ghost">
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            </section>

                            <hr style={divider} />

                            {/* Connected account */}
                            <section>
                                <h2 style={sectionTitle}>Sign-in method</h2>
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                                    padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                        {user?.auth_provider === 'github' ? (
                                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" aria-hidden="true"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                                        ) : user?.auth_provider === 'google' ? (
                                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v8"></path><path d="M8 12h8"></path></svg>
                                        ) : (
                                            <Mail size={20} color="var(--color-text-secondary)" aria-hidden="true" />
                                        )}
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontWeight: 500, fontSize: '0.875rem', textTransform: 'capitalize' }}>{user?.auth_provider || 'Email'}</div>
                                            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
                                        </div>
                                    </div>
                                    <span className="badge">Active</span>
                                </div>
                            </section>

                            <hr style={divider} />

                            {/* Personal information */}
                            <section>
                                <h2 style={sectionTitle}>Personal information</h2>
                                <div className="grid grid-cols-2" style={{ gap: 12 }}>
                                    <div>
                                        <label htmlFor="pf-name" style={fieldLabel}>Full name <span aria-hidden="true" style={{ color: 'var(--color-error)' }}>*</span></label>
                                        <input id="pf-name" type="text" className="input" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" />
                                    </div>
                                    <div>
                                        <label htmlFor="pf-email" style={fieldLabel}>Email address</label>
                                        <input id="pf-email" type="email" className="input" value={email} disabled style={{ opacity: 0.7, cursor: 'not-allowed' }} title="Change email via support" />
                                    </div>
                                    <div>
                                        <label htmlFor="pf-phone" style={fieldLabel}>Phone number <span aria-hidden="true" style={{ color: 'var(--color-error)' }}>*</span></label>
                                        <input id="pf-phone" type="tel" className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 803 123 4567" required autoComplete="tel" />
                                    </div>
                                    <div>
                                        <label htmlFor="pf-dob" style={fieldLabel}>Date of birth</label>
                                        <input id="pf-dob" type="date" className="input" value={user?.date_of_birth || ''} disabled style={{ opacity: 0.7, cursor: 'not-allowed' }} title="Contact support to correct your date of birth" />
                                    </div>
                                </div>
                            </section>

                            {/* Organization & work */}
                            <section>
                                <h2 style={sectionTitle}>Organization and work</h2>
                                <div className="grid grid-cols-2" style={{ gap: 12 }}>
                                    <div>
                                        <label htmlFor="pf-company" style={fieldLabel}>Company <span style={optional}>(optional)</span></label>
                                        <input id="pf-company" type="text" className="input" value={company} onChange={e => setCompany(e.target.value)} />
                                    </div>
                                    <div>
                                        <label htmlFor="pf-job" style={fieldLabel}>Job title <span style={optional}>(optional)</span></label>
                                        <input id="pf-job" type="text" className="input" value={jobTitle} onChange={e => setJobTitle(e.target.value)} />
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label htmlFor="pf-website" style={fieldLabel}>Website URL <span style={optional}>(optional)</span></label>
                                        <input id="pf-website" type="url" className="input" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://" />
                                    </div>
                                </div>
                            </section>

                            {/* Location */}
                            <section>
                                <h2 style={sectionTitle}>Location</h2>
                                <div className="grid grid-cols-2" style={{ gap: 12 }}>
                                    <div>
                                        <label htmlFor="pf-country" style={fieldLabel}>Country <span aria-hidden="true" style={{ color: 'var(--color-error)' }}>*</span></label>
                                        <CountrySelect id="pf-country" value={country} onChange={setCountry} required />
                                    </div>
                                    <div>
                                        <label htmlFor="pf-timezone" style={fieldLabel}>Timezone</label>
                                        <select id="pf-timezone" className="input" value={timezone} onChange={e => setTimezone(e.target.value)}>
                                            <option value="">Select timezone</option>
                                            {Intl.supportedValuesOf?.('timeZone').map(tz => (
                                                <option key={tz} value={tz}>{tz}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </section>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <button onClick={handleSaveProfile} className="btn btn-primary" disabled={saving}>
                                    {saved ? <Check size={16} /> : <Save size={16} />}
                                    {saving ? 'Saving…' : saved ? 'Saved' : 'Save profile'}
                                </button>
                                {profileError && (
                                    <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.8125rem', margin: 0 }}>{profileError}</p>
                                )}
                            </div>
                        </div>

                        <div className="card" style={{ borderColor: 'var(--color-error)' }}>
                            <h2 className="card-title" style={{ color: 'var(--color-error)' }}>Delete account</h2>
                            <p className="card-subtitle" style={{ marginBottom: 12 }}>
                                Permanently delete your account and all associated traffic data. This action cannot be undone.
                            </p>
                            <button className="btn" style={{ background: 'transparent', color: 'var(--color-error)', border: '1px solid var(--color-error)' }}>
                                <Trash2 size={16} />
                                Delete account
                            </button>
                        </div>
                    </>
                )}

                {/* ── Subscription Tab ── */}
                {activeTab === 'subscription' && (
                    <>
                        {/* Payment success banner */}
                        {paymentSuccess && (
                            <div role="status" className="card" style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
                                borderColor: 'var(--color-success)', color: 'var(--color-success)', fontSize: '0.875rem', fontWeight: 500,
                            }}>
                                <Check size={16} aria-hidden="true" />
                                <span>
                                    Payment successful. Your account has been upgraded to the{' '}
                                    <strong style={{ textTransform: 'capitalize' }}>{paymentSuccess}</strong> plan.
                                </span>
                                <button
                                    onClick={() => setPaymentSuccess(null)}
                                    aria-label="Dismiss"
                                    style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        )}

                        {/* Error banner */}
                        {upgradeError && (
                            <div role="alert" className="card" style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
                                borderColor: 'var(--color-error)', color: 'var(--color-error)', fontSize: '0.875rem', fontWeight: 500,
                            }}>
                                <AlertCircle size={16} aria-hidden="true" />
                                <span style={{ flex: 1 }}>{upgradeError}</span>
                                <button
                                    onClick={() => setUpgradeError(null)}
                                    aria-label="Dismiss"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        )}

                        {/* Current plan and usage */}
                        <ChartCard
                            title="Current plan"
                            subtitle={currentPlan === 'free'
                                ? 'You are on the Free plan. Upgrade to unlock more features.'
                                : `You have access to all ${currentPlan} features.`}
                            action={
                                <span className="badge" style={{ gap: 4 }}>
                                    <Crown size={12} aria-hidden="true" />
                                    {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
                                </span>
                            }
                        >
                            {current?.currentPeriodEnd && current.state === 'active' && (
                                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                                    Active until {shortDate(current.currentPeriodEnd)}. Plans don&apos;t renew automatically;
                                    we email you a week before. Renewing early adds a month to this date.
                                </p>
                            )}
                            {current?.state === 'grace' && current.currentPeriodEnd && current.graceEndsAt && (
                                <p style={{ fontSize: '0.8125rem', color: 'var(--color-warning)' }}>
                                    Your {current.paidPlanName} plan ended on {shortDate(current.currentPeriodEnd)}.
                                    Renew by {shortDate(current.graceEndsAt)} to keep its features.
                                </p>
                            )}

                            {meters && <UsageMeters meters={meters} />}
                        </ChartCard>

                        {/* Plans */}
                        <ChartCard
                            title="Plans"
                            subtitle="Payments are securely processed by Paystack in NGN."
                            action={
                                <button
                                    className="btn btn-ghost"
                                    onClick={() => setShowPromoInput(!showPromoInput)}
                                    aria-expanded={showPromoInput}
                                    style={{ fontSize: '0.8125rem', padding: '4px 8px' }}
                                >
                                    {showPromoInput ? <X size={14} /> : <Tag size={14} />}
                                    {showPromoInput ? 'Close' : 'Promo code'}
                                </button>
                            }
                        >
                            {showPromoInput && (
                                <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input
                                        className="input"
                                        value={promoCode}
                                        aria-label="Promo code"
                                        placeholder="Enter promo code"
                                        style={{ maxWidth: '200px', textTransform: 'uppercase' }}
                                        onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoResult(null); }}
                                    />
                                    <button
                                        className="btn btn-secondary"
                                        disabled={!promoCode.trim() || validatingPromo}
                                        onClick={() => validatePromo('pro')}
                                    >
                                        {validatingPromo ? 'Checking…' : 'Apply'}
                                    </button>
                                    {promoResult && (
                                        <span role="status" style={{ fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: 4, color: promoResult.valid ? 'var(--color-success)' : 'var(--color-error)' }}>
                                            {promoResult.valid ? <Check size={14} aria-hidden="true" /> : <AlertCircle size={14} aria-hidden="true" />}
                                            {promoResult.valid
                                                ? (promoResult.discount_type === 'percentage' ? `${promoResult.discount_value}% off` : `₦${promoResult.discount_value?.toLocaleString()} off`)
                                                : promoResult.error}
                                        </span>
                                    )}
                                </div>
                            )}

                            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                                {plans.map(plan => {
                                    const isCurrent = plan.id === currentPlan;
                                    const isFree = plan.price <= 0;
                                    const isLoading = upgradingPlan === plan.id;

                                    return (
                                        <div
                                            key={plan.id}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                padding: 16,
                                                border: `1px solid ${isCurrent ? 'var(--color-text-primary)' : 'var(--color-border)'}`,
                                                borderRadius: 'var(--radius-md)',
                                                opacity: upgradingPlan && !isLoading ? 0.7 : 1,
                                                transition: 'opacity 0.2s',
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4, minHeight: 22 }}>
                                                <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>{plan.name}</h3>
                                                {isCurrent && <span className="badge">Current</span>}
                                            </div>
                                            <div style={{ marginBottom: 12 }}>
                                                <span style={{ fontSize: '1.5rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                                    {formatPlanPrice(plan.price, plan.currency)}
                                                </span>
                                                <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>
                                                    {planPeriod({ price: plan.price, interval: plan.interval as 'monthly' | 'yearly' })}
                                                </span>
                                            </div>

                                            <ul style={{
                                                listStyle: 'none',
                                                padding: 0,
                                                margin: '0 0 16px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 6,
                                                flex: 1,
                                            }}>
                                                {plan.features.map((feature, i) => (
                                                    <li key={i} className="flex items-center gap-sm" style={{ fontSize: '0.8125rem' }}>
                                                        <Check size={14} aria-hidden="true" style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                                                        {feature}
                                                    </li>
                                                ))}
                                            </ul>

                                            <button
                                                className={`btn ${isCurrent || isFree ? 'btn-secondary' : 'btn-primary'}`}
                                                style={{ width: '100%', justifyContent: 'center' }}
                                                disabled={isCurrent || isFree || !!upgradingPlan}
                                                onClick={() => !isCurrent && !isFree && handleUpgrade(plan.id)}
                                            >
                                                {isLoading ? (
                                                    <>
                                                        <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                                        Redirecting…
                                                    </>
                                                ) : isCurrent ? (
                                                    'Current plan'
                                                ) : isFree ? (
                                                    'Free forever'
                                                ) : (
                                                    `Upgrade — ${formatPlanPrice(plan.price, plan.currency)}${planPeriod({ price: plan.price, interval: plan.interval as 'monthly' | 'yearly' })}`
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </ChartCard>
                    </>
                )}

                {/* ── Notifications Tab ── */}
                {activeTab === 'notifications' && (
                    <ChartCard flush title="Email notifications" subtitle="Choose which emails you receive.">
                        <div style={{ marginTop: 10, borderTop: '1px solid var(--color-border)' }}>
                            {Object.entries(notifications).map(([key, value], index, all) => (
                                <div
                                    key={key}
                                    className="flex items-center justify-between"
                                    style={{ gap: 12, padding: '12px 20px', borderBottom: index < all.length - 1 ? '1px solid var(--color-border)' : undefined }}
                                >
                                    <div style={{ minWidth: 0 }}>
                                        <div id={`notif-${key}`} style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                                            {NOTIFICATION_COPY[key]?.label ?? key}
                                        </div>
                                        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                                            {NOTIFICATION_COPY[key]?.description}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={value}
                                        aria-labelledby={`notif-${key}`}
                                        onClick={() => setNotifications(prev => ({ ...prev, [key]: !value }))}
                                        style={{
                                            width: '40px',
                                            height: '22px',
                                            borderRadius: 'var(--radius-full)',
                                            background: value ? 'var(--color-text-primary)' : 'var(--color-bg-tertiary)',
                                            border: '1px solid var(--color-border)',
                                            cursor: 'pointer',
                                            position: 'relative',
                                            transition: 'background var(--transition-fast)',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <span style={{
                                            position: 'absolute',
                                            top: '2px',
                                            left: value ? '20px' : '2px',
                                            width: '16px',
                                            height: '16px',
                                            borderRadius: 'var(--radius-full)',
                                            background: value ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
                                            transition: 'left var(--transition-fast)',
                                        }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </ChartCard>
                )}

                {/* ── Export Tab ── */}
                {activeTab === 'export' && (
                    <ChartCard
                        flush
                        title="Export your data"
                        subtitle="Download the selected site's 10,000 most recent sessions or events as CSV."
                    >
                        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, borderTop: '1px solid var(--color-border)' }}>
                            {([
                                { type: 'sessions', label: 'Sessions', description: 'One row per visit' },
                                { type: 'events', label: 'Events', description: 'One row per tracked event' },
                            ] as const).map((item, index) => (
                                <li key={item.type} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderTop: index ? '1px solid var(--color-border)' : undefined }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{item.label}</div>
                                        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>{item.description}</div>
                                    </div>
                                    <button
                                        onClick={() => handleExport(item.type)}
                                        disabled={!selectedDomainId}
                                        className="btn btn-secondary"
                                        style={{ padding: '6px 12px', fontSize: '0.8125rem' }}
                                    >
                                        <Download size={14} />
                                        Download CSV
                                    </button>
                                </li>
                            ))}
                        </ul>
                        {exportError && (
                            <p role="alert" style={{ padding: '0 20px 12px', fontSize: '0.8125rem', color: 'var(--color-error)' }}>
                                {exportError}
                            </p>
                        )}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)' }}>
                            <Shield size={14} aria-hidden="true" style={{ color: 'var(--color-text-secondary)', flexShrink: 0, marginTop: 2 }} />
                            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                                Exports are available on the Pro plan and above. Only the site owner can export its data.
                            </p>
                        </div>
                    </ChartCard>
                )}
            </div>

            {/* Spinner keyframe */}
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

const NOTIFICATION_COPY: Record<string, { label: string; description: string }> = {
    weeklyReport: { label: 'Weekly report', description: 'A summary of your analytics every week' },
    trafficAlerts: { label: 'Traffic alerts', description: 'Significant changes in traffic' },
    insightAlerts: { label: 'AI insight alerts', description: 'High-priority AI insights by email' },
    productUpdates: { label: 'Product updates', description: 'New features and improvements' },
};

const sectionTitle: React.CSSProperties = {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    marginBottom: 10,
};

const fieldLabel: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: '0.8125rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
};

const optional: React.CSSProperties = { color: 'var(--color-text-muted)', fontWeight: 400 };

const divider: React.CSSProperties = { border: 'none', borderTop: '1px solid var(--color-border)', margin: 0 };

export default function SettingsPage() {
    return (
        <Suspense fallback={
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-xl)' }}>
                <div className="loading-spinner" />
            </div>
        }>
            <SettingsPageInner />
        </Suspense>
    );
}
