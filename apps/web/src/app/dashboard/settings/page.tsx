'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Settings,
    User,
    CreditCard,
    Shield,
    Download,
    Bell,
    Trash2,
    Save,
    Check,
    Crown,
    Loader,
    AlertCircle,
    X,
    Lock,
    Mail,
} from 'lucide-react';
import { auth, exportData, formatPlanPrice, payments, type ExportType } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';

// Marketing copy for each plan. Names and prices are replaced by the API's
// (the price checkout actually charges); these values are only the fallback.
const fallbackPlans = [
    {
        id: 'free',
        name: 'Hobby',
        price: 0,
        currency: 'NGN',
        features: ['1 domain', '5,000 events/mo', '30-day history', 'Core analytics & UTM'],
    },
    {
        id: 'pro',
        name: 'Pro',
        price: 45000,
        currency: 'NGN',
        features: ['3 domains', '100,000 events/mo', '1-year history', 'Heatmaps & recordings', 'Funnels & AI insights', 'CSV export & team'],
    },
    {
        id: 'agency',
        name: 'Agency',
        price: 125000,
        currency: 'NGN',
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
    const [usage, setUsage] = useState<{ eventsThisMonth: number; eventsLimit: number; percentUsed: number } | null>(null);
    const { selectedDomainId } = useDomain();
    const [exportError, setExportError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
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
            if (data?.usage) setUsage(data.usage);
        });
    }, []);

    useEffect(() => {
        payments.getPlans().then(({ data }) => {
            if (!data?.plans) return;
            setPlans(prev => prev.map(plan => {
                const live = data.plans.find(p => p.id === plan.id);
                return live
                    ? { ...plan, name: live.name, price: live.price, currency: live.currency ?? plan.currency }
                    : plan;
            }));
        });
    }, []);

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
        setSaving(true);
        try {
            const res = await auth.updateProfile({
                name, company, job_title: jobTitle, website, phone, country, timezone
            });
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
        { id: 'account', label: 'Account', icon: User },
        { id: 'subscription', label: 'Subscription', icon: CreditCard },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'export', label: 'Export Data', icon: Download },
    ];

    if (loading) {
        return (
            <div>
                <div className="skeleton" style={{ height: '40px', width: '200px', marginBottom: 'var(--space-xl)' }} />
                <div className="card">
                    <div className="skeleton" style={{ height: '400px' }} />
                </div>
            </div>
        );
    }

    const currentPlan = user?.subscription || 'free';
    const avatarSrc = user?.avatar_url?.startsWith('/uploads')
        ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${user.avatar_url}`
        : user?.avatar_url;

    return (
        <div>
            <h1 style={{ marginBottom: 'var(--space-xl)' }}>Settings</h1>

            <div className="grid grid-cols-4 gap-lg">
                {/* Sidebar */}
                <div>
                    <nav style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
                                    padding: 'var(--space-sm) var(--space-md)',
                                    background: activeTab === tab.id ? 'var(--color-bg-hover)' : 'transparent',
                                    border: 'none', borderRadius: 'var(--radius-md)',
                                    color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                    cursor: 'pointer', fontSize: '0.875rem', textAlign: 'left',
                                }}
                            >
                                <tab.icon size={18} />
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Content */}
                <div style={{ gridColumn: 'span 3' }}>

                    {/* ── Account Tab ── */}
                    {activeTab === 'account' && (
                        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
                            <h3 style={{ margin: 0 }}>Account Settings</h3>

                            {/* Avatar Section */}
                            <div>
                                <h4 style={{ marginBottom: 'var(--space-md)', fontSize: '1rem' }}>Profile Picture</h4>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)' }}>
                                    <div style={{ position: 'relative' }}>
                                        <img
                                            src={avatarSrc}
                                            alt={user?.name || 'User'}
                                            style={{
                                                width: '80px', height: '80px', borderRadius: '50%',
                                                objectFit: 'cover', border: '1px solid var(--color-border)',
                                                opacity: avatarUploading ? 0.5 : 1
                                            }}
                                        />
                                        {avatarUploading && (
                                            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                                                <Loader size={20} className="spin" color="var(--color-accent-primary)" />
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                                        <div>
                                            <input type="file" id="avatarUpload" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
                                            <label htmlFor="avatarUpload" className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                                                Change
                                            </label>
                                        </div>
                                        <button onClick={handleAvatarRemove} className="btn" style={{ border: '1px solid var(--color-border)' }}>
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)' }} />

                            {/* Connected Accounts Section */}
                            <div>
                                <h4 style={{ marginBottom: 'var(--space-md)', fontSize: '1rem' }}>Connected Accounts</h4>
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: 'var(--space-md)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                                        {user?.auth_provider === 'github' ? (
                                            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                                        ) : user?.auth_provider === 'google' ? (
                                            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v8"></path><path d="M8 12h8"></path></svg>
                                        ) : (
                                            <Mail size={24} color="var(--color-text-secondary)" />
                                        )}
                                        <div>
                                            <div style={{ fontWeight: 500, textTransform: 'capitalize' }}>{user?.auth_provider || 'Email'}</div>
                                            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{user?.email}</div>
                                        </div>
                                    </div>
                                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', background: 'var(--color-bg-hover)', padding: '2px 8px', borderRadius: '12px' }}>Active Provider</span>
                                </div>
                            </div>

                            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)' }} />

                            {/* Personal Information */}
                            <div>
                                <h4 style={{ marginBottom: 'var(--space-md)', fontSize: '1rem' }}>Personal Information</h4>
                                <div className="grid grid-cols-2 gap-md">
                                    <div>
                                        <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Full Name</label>
                                        <input type="text" className="input" value={name} onChange={e => setName(e.target.value)} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Email Address</label>
                                        <input type="email" className="input" value={email} disabled style={{ opacity: 0.7, cursor: 'not-allowed' }} title="Change email via support" />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Phone Number <span style={{ opacity: 0.5 }}>(optional)</span></label>
                                        <input type="tel" className="input" value={phone} onChange={e => setPhone(e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            {/* Organization & Work */}
                            <div>
                                <h4 style={{ marginBottom: 'var(--space-md)', fontSize: '1rem' }}>Organization & Work</h4>
                                <div className="grid grid-cols-2 gap-md">
                                    <div>
                                        <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Company <span style={{ opacity: 0.5 }}>(optional)</span></label>
                                        <input type="text" className="input" value={company} onChange={e => setCompany(e.target.value)} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Job Title <span style={{ opacity: 0.5 }}>(optional)</span></label>
                                        <input type="text" className="input" value={jobTitle} onChange={e => setJobTitle(e.target.value)} />
                                    </div>
                                    <div style={{ gridColumn: 'span 2' }}>
                                        <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Website URL <span style={{ opacity: 0.5 }}>(optional)</span></label>
                                        <input type="url" className="input" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://" />
                                    </div>
                                </div>
                            </div>

                            {/* Demographics */}
                            <div>
                                <h4 style={{ marginBottom: 'var(--space-md)', fontSize: '1rem' }}>Demographics</h4>
                                <div className="grid grid-cols-2 gap-md">
                                    <div>
                                        <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Country <span style={{ opacity: 0.5 }}>(optional)</span></label>
                                        <input type="text" className="input" value={country} onChange={e => setCountry(e.target.value)} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Timezone</label>
                                        <select className="input" value={timezone} onChange={e => setTimezone(e.target.value)}>
                                            <option value="">Select Timezone</option>
                                            {Intl.supportedValuesOf?.('timeZone').map(tz => (
                                                <option key={tz} value={tz}>{tz}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <button onClick={handleSaveProfile} className="btn btn-primary" disabled={saving}>
                                    {saved ? <Check size={18} /> : <Save size={18} />}
                                    {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Profile'}
                                </button>
                            </div>

                            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)' }} />

                            <div>
                                <h4 style={{ color: 'var(--color-error)' }}>Danger Zone</h4>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
                                    Permanently delete your account and all associated traffic data. This action cannot be undone.
                                </p>
                                <button className="btn" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-error)', border: '1px solid var(--color-error)' }}>
                                    <Trash2 size={18} />
                                    Delete Account
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Subscription Tab ── */}
                    {activeTab === 'subscription' && (
                        <div>
                            {/* Payment success banner */}
                            {paymentSuccess && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-sm)',
                                    padding: 'var(--space-md) var(--space-lg)',
                                    background: 'rgba(34, 197, 94, 0.12)',
                                    border: '1px solid rgba(34, 197, 94, 0.4)',
                                    borderRadius: 'var(--radius-md)',
                                    marginBottom: 'var(--space-lg)',
                                    color: '#22c55e',
                                    fontWeight: 500,
                                }}>
                                    <Check size={18} />
                                    <span>
                                        Payment successful! Your account has been upgraded to the{' '}
                                        <strong style={{ textTransform: 'capitalize' }}>{paymentSuccess}</strong> plan.
                                    </span>
                                    <button
                                        onClick={() => setPaymentSuccess(null)}
                                        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            )}

                            {/* Error banner */}
                            {upgradeError && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-sm)',
                                    padding: 'var(--space-md) var(--space-lg)',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.35)',
                                    borderRadius: 'var(--radius-md)',
                                    marginBottom: 'var(--space-lg)',
                                    color: 'var(--color-error)',
                                    fontWeight: 500,
                                }}>
                                    <AlertCircle size={18} />
                                    <span style={{ flex: 1 }}>{upgradeError}</span>
                                    <button
                                        onClick={() => setUpgradeError(null)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            )}

                            {/* Current Plan */}
                            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                                <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-md)' }}>
                                    <h3>Current Plan</h3>
                                    <span className="badge">
                                        <Crown size={12} style={{ marginRight: '4px' }} />
                                        {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                    {currentPlan === 'free'
                                        ? 'You are on the Free plan. Upgrade to unlock more features.'
                                        : `You have access to all ${currentPlan} features.`}
                                </p>
                                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 'var(--space-xs)' }}>
                                    Payments are securely processed by <strong>Paystack</strong> in NGN.
                                </p>

                                {usage && <UsageMeter {...usage} />}
                            </div>

                            {/* Promo code input */}
                            <div style={{ marginBottom: 'var(--space-md)' }}>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setShowPromoInput(!showPromoInput)}
                                    style={{ fontSize: '0.85rem', padding: '4px 0' }}
                                >
                                    {showPromoInput ? '✕ Close' : '🏷️ Have a promo code?'}
                                </button>
                                {showPromoInput && (
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                                        <input
                                            className="input"
                                            value={promoCode}
                                            placeholder="Enter promo code"
                                            style={{ maxWidth: '200px', textTransform: 'uppercase' }}
                                            onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoResult(null); }}
                                        />
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            disabled={!promoCode.trim() || validatingPromo}
                                            onClick={() => validatePromo('pro')}
                                        >
                                            {validatingPromo ? 'Checking...' : 'Apply'}
                                        </button>
                                        {promoResult && (
                                            <span style={{ fontSize: '0.85rem', color: promoResult.valid ? '#00d68f' : '#ff5555' }}>
                                                {promoResult.valid
                                                    ? `✓ ${promoResult.discount_type === 'percentage' ? `${promoResult.discount_value}% off` : `₦${promoResult.discount_value?.toLocaleString()} off`}`
                                                    : promoResult.error}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Plan Cards */}
                            <div className="grid grid-cols-3 gap-md">
                                {plans.map(plan => {
                                    const isCurrent = plan.id === currentPlan;
                                    const isFree = plan.id === 'free';
                                    const isLoading = upgradingPlan === plan.id;

                                    return (
                                        <div
                                            key={plan.id}
                                            className="card"
                                            style={{
                                                borderColor: isCurrent ? 'var(--color-text-primary)' : undefined,
                                                position: 'relative',
                                                opacity: upgradingPlan && !isLoading ? 0.7 : 1,
                                                transition: 'opacity 0.2s',
                                            }}
                                        >
                                            <h4 style={{ marginBottom: 'var(--space-sm)' }}>{plan.name}</h4>
                                            <div style={{ marginBottom: 'var(--space-md)' }}>
                                                <span style={{ fontSize: '2rem', fontWeight: 700 }}>
                                                    {formatPlanPrice(plan.price, plan.currency)}
                                                </span>
                                                <span style={{ color: 'var(--color-text-muted)' }}>
                                                    {plan.price > 0 ? '/mo' : ''}
                                                </span>
                                            </div>

                                            <ul style={{
                                                listStyle: 'none',
                                                padding: 0,
                                                marginBottom: 'var(--space-lg)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 'var(--space-sm)',
                                            }}>
                                                {plan.features.map((feature, i) => (
                                                    <li key={i} className="flex items-center gap-sm" style={{ fontSize: '0.875rem' }}>
                                                        <Check size={14} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                                                        {feature}
                                                    </li>
                                                ))}
                                            </ul>

                                            <button
                                                className={`btn ${isCurrent || isFree ? 'btn-secondary' : 'btn-primary'}`}
                                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                                disabled={isCurrent || isFree || !!upgradingPlan}
                                                onClick={() => !isCurrent && !isFree && handleUpgrade(plan.id)}
                                            >
                                                {isLoading ? (
                                                    <>
                                                        <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                                        Redirecting...
                                                    </>
                                                ) : isCurrent ? (
                                                    'Current Plan'
                                                ) : isFree ? (
                                                    'Free Forever'
                                                ) : (
                                                    `Upgrade — ${formatPlanPrice(plan.price, plan.currency)}/mo`
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Paystack badge */}
                            <p style={{
                                marginTop: 'var(--space-lg)',
                                fontSize: '0.8rem',
                                color: 'var(--color-text-muted)',
                                textAlign: 'center',
                            }}>
                                Payments are securely processed by <strong>Paystack</strong> in NGN.
                            </p>
                        </div>
                    )}

                    {/* ── Notifications Tab ── */}
                    {activeTab === 'notifications' && (
                        <div className="card">
                            <h3 style={{ marginBottom: 'var(--space-lg)' }}>Notification Preferences</h3>

                            {Object.entries(notifications).map(([key, value]) => (
                                <div
                                    key={key}
                                    className="flex items-center justify-between"
                                    style={{ padding: 'var(--space-md) 0', borderBottom: '1px solid var(--color-border)' }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 500 }}>
                                            {key === 'weeklyReport' && 'Weekly Report'}
                                            {key === 'trafficAlerts' && 'Traffic Alerts'}
                                            {key === 'insightAlerts' && 'AI Insight Alerts'}
                                            {key === 'productUpdates' && 'Product Updates'}
                                        </div>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                                            {key === 'weeklyReport' && 'Receive a summary of your analytics every week'}
                                            {key === 'trafficAlerts' && 'Get notified of significant traffic changes'}
                                            {key === 'insightAlerts' && 'Receive high-priority AI insights via email'}
                                            {key === 'productUpdates' && 'Stay updated on new features and improvements'}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setNotifications(prev => ({ ...prev, [key]: !value }))}
                                        style={{
                                            width: '48px',
                                            height: '24px',
                                            borderRadius: 'var(--radius-full)',
                                            background: value ? 'var(--color-text-primary)' : 'var(--color-bg-tertiary)',
                                            border: 'none',
                                            cursor: 'pointer',
                                            position: 'relative',
                                            transition: 'background var(--transition-fast)',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <span style={{
                                            position: 'absolute',
                                            top: '2px',
                                            left: value ? '26px' : '2px',
                                            width: '20px',
                                            height: '20px',
                                            borderRadius: 'var(--radius-full)',
                                            background: value ? '#000' : 'white',
                                            transition: 'left var(--transition-fast)',
                                        }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Export Tab ── */}
                    {activeTab === 'export' && (
                        <div className="card">
                            <h3 style={{ marginBottom: 'var(--space-md)' }}>Export Your Data</h3>
                            <p style={{ marginBottom: 'var(--space-lg)', color: 'var(--color-text-secondary)' }}>
                                Download the selected domain&apos;s 10,000 most recent sessions or events as CSV.
                            </p>

                            <div className="grid grid-cols-2 gap-md" style={{ marginBottom: 'var(--space-xl)' }}>
                                <button
                                    onClick={() => handleExport('sessions')}
                                    disabled={!selectedDomainId}
                                    className="btn btn-secondary"
                                    style={{ padding: 'var(--space-lg)', flexDirection: 'column', height: 'auto' }}
                                >
                                    <Download size={24} style={{ marginBottom: 'var(--space-sm)' }} />
                                    <span style={{ fontWeight: 600 }}>Sessions CSV</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>One row per visit</span>
                                </button>

                                <button
                                    onClick={() => handleExport('events')}
                                    disabled={!selectedDomainId}
                                    className="btn btn-secondary"
                                    style={{ padding: 'var(--space-lg)', flexDirection: 'column', height: 'auto' }}
                                >
                                    <Download size={24} style={{ marginBottom: 'var(--space-sm)' }} />
                                    <span style={{ fontWeight: 600 }}>Events CSV</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>One row per tracked event</span>
                                </button>
                            </div>

                            {exportError && (
                                <p style={{ marginTop: 'calc(-1 * var(--space-md))', marginBottom: 'var(--space-lg)', fontSize: '0.85rem', color: '#ff5555' }}>
                                    {exportError}
                                </p>
                            )}

                            <div style={{
                                padding: 'var(--space-md)',
                                background: 'var(--color-bg-secondary)',
                                borderRadius: 'var(--radius-md)',
                                borderLeft: '3px solid var(--color-text-primary)',
                            }}>
                                <Shield size={18} style={{ marginBottom: 'var(--space-sm)', color: 'var(--color-text-primary)' }} />
                                <p style={{ fontSize: '0.875rem', margin: 0 }}>
                                    Exports are available on the Pro plan and above. Only the domain owner can export its data.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
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

/** Events used this month against the plan's monthly allowance. */
function UsageMeter({ eventsThisMonth, eventsLimit, percentUsed }: { eventsThisMonth: number; eventsLimit: number; percentUsed: number }) {
    const color = percentUsed >= 100 ? '#ff5555' : percentUsed >= 85 ? '#ffaa00' : 'var(--color-text-primary)';
    return (
        <div style={{ marginTop: 'var(--space-lg)' }}>
            <div className="flex items-center justify-between" style={{ fontSize: '0.875rem', marginBottom: 'var(--space-xs)' }}>
                <span>Events this month</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                    {eventsThisMonth.toLocaleString()} of {eventsLimit.toLocaleString()} ({percentUsed}%)
                </span>
            </div>
            <div
                role="progressbar"
                aria-label="Events used this month"
                aria-valuemin={0}
                aria-valuemax={eventsLimit}
                aria-valuenow={eventsThisMonth}
                style={{ height: '8px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}
            >
                <div style={{ width: `${Math.min(percentUsed, 100)}%`, height: '100%', background: color, borderRadius: '4px' }} />
            </div>
            {percentUsed >= 85 && (
                <p style={{ fontSize: '0.8rem', color, marginTop: 'var(--space-xs)' }}>
                    {percentUsed >= 100
                        ? "You are over this plan's monthly allowance."
                        : "You are close to this plan's monthly allowance."}
                    {' '}The count resets on the 1st (UTC).
                </p>
            )}
        </div>
    );
}

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
