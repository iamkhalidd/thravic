'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Edit, Plus, Check, X, ToggleLeft, ToggleRight } from 'lucide-react';

// GET /api/admin/plans. Limits and features apply to every customer on the plan
// (within a minute); retention is set on the Retention page and shown here.
interface Plan {
    id: string;
    name: string;
    price: number;
    currency: string;
    interval: string;
    events_limit: number;
    domains_limit: number;
    team_limit: number | null;
    recordings_per_day: number | null;
    features: string[];
    active: boolean;
    sort_order: number;
    tagline: string;
    extra_features: string[];
    badge: string;
    show_on_landing: boolean;
    retention: { events?: number; sessions?: number; recordings?: number; heatmaps?: number };
    bullets: string[];
}

interface FeatureOption { id: string; label: string }

interface Preview { name: string; price: number; currency: string; interval: string; tagline: string; badge: string; bullets: string[] }

const CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR'];

function formatPrice(price: number, currency: string) {
    const symbols: Record<string, string> = { NGN: '₦', USD: '$', GBP: '£', EUR: '€' };
    return price === 0 ? 'Free' : `${symbols[currency] || currency}${price.toLocaleString()}`;
}

const EMPTY_FORM = {
    id: '', name: '', price: 0, currency: 'NGN', interval: 'monthly',
    events_limit: 5000, domains_limit: 1,
    team_limit: '' as string, recordings_per_day: '' as string,
    features: [] as string[], active: true, sort_order: 0,
    tagline: '', badge: '', show_on_landing: true, extra_features: '',
};
type Form = typeof EMPTY_FORM;

// Blank = unlimited (null); otherwise a whole number.
const limitValue = (raw: string) => (raw.trim() === '' ? null : Math.max(0, parseInt(raw) || 0));

function payloadOf(form: Form) {
    return {
        ...form,
        team_limit: limitValue(form.team_limit),
        recordings_per_day: limitValue(form.recordings_per_day),
        extra_features: form.extra_features.split('\n').map(line => line.trim()).filter(Boolean),
    };
}

export default function PlansPage() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [featureOptions, setFeatureOptions] = useState<FeatureOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [editPlan, setEditPlan] = useState<Plan | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [form, setForm] = useState<Form>(EMPTY_FORM);
    const [preview, setPreview] = useState<Preview | null>(null);
    const previewTimer = useRef<ReturnType<typeof setTimeout>>();

    const loadPlans = async () => {
        setLoading(true);
        try {
            const data = await api.get('/api/admin/plans');
            setPlans(data.plans || []);
            setFeatureOptions(data.featureOptions || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadPlans(); }, []);

    const isEditing = editPlan || showCreate;

    // Live pricing-card preview, computed by the API with the same rules as the
    // landing page (debounced while typing).
    useEffect(() => {
        if (!isEditing) return;
        clearTimeout(previewTimer.current);
        previewTimer.current = setTimeout(async () => {
            try {
                const { id, ...draft } = payloadOf(form);
                setPreview(await api.post('/api/admin/plans/preview', { ...draft, id: editPlan?.id || id || 'draft' }));
            } catch {
                setPreview(null);
            }
        }, 300);
        return () => clearTimeout(previewTimer.current);
    }, [form, isEditing, editPlan]);

    const openEdit = (plan: Plan) => {
        setEditPlan(plan);
        setShowCreate(false);
        setForm({
            id: plan.id,
            name: plan.name,
            price: plan.price,
            currency: plan.currency,
            interval: plan.interval,
            events_limit: plan.events_limit,
            domains_limit: plan.domains_limit,
            team_limit: plan.team_limit == null ? '' : String(plan.team_limit),
            recordings_per_day: plan.recordings_per_day == null ? '' : String(plan.recordings_per_day),
            features: plan.features,
            active: plan.active,
            sort_order: plan.sort_order,
            tagline: plan.tagline || '',
            badge: plan.badge || '',
            show_on_landing: plan.show_on_landing,
            extra_features: (plan.extra_features || []).join('\n'),
        });
    };

    const openCreate = () => {
        setEditPlan(null);
        setShowCreate(true);
        setForm({ ...EMPTY_FORM, features: ['analytics', 'realtime', 'utm'], sort_order: plans.length });
    };

    const close = () => { setEditPlan(null); setShowCreate(false); setPreview(null); };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const payload = payloadOf(form);
            if (showCreate) {
                await api.post('/api/admin/plans', payload);
                setMessage({ type: 'success', text: `Plan "${form.name}" created. It has the free plan's retention until you change it on the Retention page.` });
            } else if (editPlan) {
                const { id, ...updateData } = payload;
                await api.put(`/api/admin/plans/${editPlan.id}`, updateData);
                setMessage({ type: 'success', text: `Plan "${form.name}" updated. Customers on it, the landing page and billing reflect it within a minute.` });
            }
            close();
            loadPlans();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Failed to save plan' });
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (plan: Plan) => {
        try {
            await api.put(`/api/admin/plans/${plan.id}`, { active: !plan.active });
            loadPlans();
            setMessage({
                type: 'success',
                text: plan.active
                    ? `${plan.name} can no longer be bought; current customers keep it.`
                    : `${plan.name} can be bought again.`,
            });
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        }
    };

    const toggleFeature = (id: string) =>
        setForm(f => ({ ...f, features: f.features.includes(id) ? f.features.filter(x => x !== id) : [...f.features, id] }));

    const editedRetention = editPlan?.retention;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', maxWidth: 640 }}>
                    One definition per plan. Limits and features apply to every customer on the plan, and the landing page
                    and billing page show them, within a minute of saving.
                </p>
                <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Plus size={16} /> New Plan
                </button>
            </div>

            {message && (
                <div className="card" style={{
                    marginBottom: 'var(--space-md)',
                    padding: 'var(--space-sm) var(--space-md)',
                    background: message.type === 'success' ? 'rgba(0,214,143,0.1)' : 'rgba(255,85,85,0.1)',
                    borderLeft: `3px solid ${message.type === 'success' ? '#00d68f' : '#ff5555'}`,
                }}>
                    {message.text}
                </div>
            )}

            <div className="table-scroll">
                <div className="card" style={{ padding: 0, overflow: 'hidden', minWidth: '900px' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Plan</th>
                                <th>Price</th>
                                <th>Events / mo</th>
                                <th>Websites</th>
                                <th>Team</th>
                                <th>Recordings / day</th>
                                <th>Retention</th>
                                <th>On landing</th>
                                <th>For sale</th>
                                <th>Edit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={10} className="loading"><div className="spinner" /></td></tr>
                            ) : plans.length === 0 ? (
                                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>No plans configured. Click &quot;New Plan&quot; to create one.</td></tr>
                            ) : plans.map(plan => (
                                <tr key={plan.id} style={{ opacity: plan.active ? 1 : 0.5 }}>
                                    <td>
                                        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{plan.name}</span>
                                        {plan.badge && <span className="badge" style={{ marginLeft: 6 }}>{plan.badge}</span>}
                                        <br /><span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{plan.id}</span>
                                    </td>
                                    <td style={{ fontWeight: 600, fontSize: '15px' }}>
                                        {formatPrice(plan.price, plan.currency)}
                                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 400 }}> /{plan.interval === 'yearly' ? 'yr' : 'mo'}</span>
                                    </td>
                                    <td>{plan.events_limit.toLocaleString()}</td>
                                    <td>{plan.domains_limit}</td>
                                    <td>{plan.features.includes('team') ? (plan.team_limit ?? 'Unlimited') : '—'}</td>
                                    <td>{plan.features.includes('recordings') ? (plan.recordings_per_day ?? 'Unlimited') : '—'}</td>
                                    <td>{plan.retention?.events ? `${plan.retention.events} days` : '—'}</td>
                                    <td>{plan.show_on_landing ? 'Yes' : 'Hidden'}</td>
                                    <td>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => toggleActive(plan)}
                                            title={plan.active ? 'Stop selling this plan' : 'Sell this plan again'}
                                            style={{ color: plan.active ? '#00d68f' : '#666' }}
                                        >
                                            {plan.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                        </button>
                                    </td>
                                    <td>
                                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(plan)} title="Edit" aria-label={`Edit ${plan.name}`}>
                                            <Edit size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {isEditing && (
                <div className="modal-overlay" onClick={close}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '960px', maxHeight: '90vh' }}>
                        <h3 className="modal-title">{showCreate ? 'Create New Plan' : `Edit: ${editPlan?.name}`}</h3>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 'var(--space-xl)' }}>
                            <div>
                                <h4 style={sectionStyle}>Price</h4>
                                <div style={gridStyle}>
                                    {showCreate && (
                                        <Field label="Plan ID (permanent)">
                                            <input className="input" value={form.id} placeholder="e.g. starter"
                                                onChange={e => setForm(f => ({ ...f, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))} />
                                        </Field>
                                    )}
                                    <Field label="Display name">
                                        <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                                    </Field>
                                    <Field label="Price (whole units, 0 = free)">
                                        <input className="input" type="number" min={0} value={form.price}
                                            onChange={e => setForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))} />
                                    </Field>
                                    <Field label="Currency">
                                        <select className="input" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Billed">
                                        <select className="input" value={form.interval} onChange={e => setForm(f => ({ ...f, interval: e.target.value }))}>
                                            <option value="monthly">Monthly</option>
                                            <option value="yearly">Yearly</option>
                                        </select>
                                    </Field>
                                </div>
                                <p style={hintStyle}>A new price applies from each customer&apos;s next payment.</p>

                                <h4 style={sectionStyle}>Limits</h4>
                                <div style={gridStyle}>
                                    <Field label="Events per month">
                                        <input className="input" type="number" min={0} value={form.events_limit}
                                            onChange={e => setForm(f => ({ ...f, events_limit: parseInt(e.target.value) || 0 }))} />
                                    </Field>
                                    <Field label="Websites">
                                        <input className="input" type="number" min={0} value={form.domains_limit}
                                            onChange={e => setForm(f => ({ ...f, domains_limit: parseInt(e.target.value) || 0 }))} />
                                    </Field>
                                    <Field label="Team members (blank = unlimited)">
                                        <input className="input" type="number" min={0} value={form.team_limit} placeholder="Unlimited"
                                            disabled={!form.features.includes('team')}
                                            onChange={e => setForm(f => ({ ...f, team_limit: e.target.value }))} />
                                    </Field>
                                    <Field label="Recordings per day (blank = unlimited)">
                                        <input className="input" type="number" min={0} value={form.recordings_per_day} placeholder="Unlimited"
                                            disabled={!form.features.includes('recordings')}
                                            onChange={e => setForm(f => ({ ...f, recordings_per_day: e.target.value }))} />
                                    </Field>
                                </div>
                                <p style={hintStyle}>
                                    Retention: {editedRetention?.events
                                        ? `events ${editedRetention.events} days, recordings ${editedRetention.recordings ?? '—'} days`
                                        : 'the free plan’s until changed'} — set on the <Link href="/retention" style={{ textDecoration: 'underline' }}>Retention page</Link>.
                                    Lowering a limit affects existing customers straight away.
                                </p>

                                <h4 style={sectionStyle}>Features</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                                    {featureOptions.map(option => (
                                        <label key={option.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                                            <input type="checkbox" checked={form.features.includes(option.id)} onChange={() => toggleFeature(option.id)} />
                                            {option.label}
                                        </label>
                                    ))}
                                </div>

                                <h4 style={sectionStyle}>Pricing card</h4>
                                <div style={gridStyle}>
                                    <Field label="Tagline">
                                        <input className="input" value={form.tagline} maxLength={200} placeholder="For startups & businesses"
                                            onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))} />
                                    </Field>
                                    <Field label="Badge (optional)">
                                        <input className="input" value={form.badge} maxLength={40} placeholder="Most popular"
                                            onChange={e => setForm(f => ({ ...f, badge: e.target.value }))} />
                                    </Field>
                                    <Field label="Card order">
                                        <input className="input" type="number" min={0} value={form.sort_order}
                                            onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} />
                                    </Field>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginTop: 22 }}>
                                        <input type="checkbox" checked={form.show_on_landing}
                                            onChange={e => setForm(f => ({ ...f, show_on_landing: e.target.checked }))} />
                                        Show on the landing page
                                    </label>
                                </div>
                                <Field label="Extra lines, one per line (e.g. Priority support)">
                                    <textarea className="input" rows={3} value={form.extra_features}
                                        onChange={e => setForm(f => ({ ...f, extra_features: e.target.value }))} />
                                </Field>
                                <p style={hintStyle}>Lines about limits and features are written for you from the settings above, so they always match what customers get.</p>
                            </div>

                            <div>
                                <h4 style={sectionStyle}>Preview</h4>
                                {preview ? (
                                    <div className="card" style={{ padding: 'var(--space-lg)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <strong style={{ fontSize: 17 }}>{preview.name}</strong>
                                            {preview.badge && <span className="badge">{preview.badge}</span>}
                                        </div>
                                        <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: '6px 0 16px', minHeight: 18 }}>{preview.tagline}</p>
                                        <div style={{ fontSize: 30, fontWeight: 600, marginBottom: 16 }}>
                                            {formatPrice(preview.price, preview.currency)}
                                            {preview.price > 0 && <span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 400 }}> /{preview.interval === 'yearly' ? 'yr' : 'mo'}</span>}
                                        </div>
                                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
                                            {preview.bullets.map(line => (
                                                <li key={line} style={{ display: 'flex', gap: 8 }}><Check size={14} style={{ marginTop: 3, flexShrink: 0 }} />{line}</li>
                                            ))}
                                        </ul>
                                        {!form.show_on_landing && <p style={hintStyle}>Hidden from the landing page.</p>}
                                    </div>
                                ) : (
                                    <p style={hintStyle}>Fill in the plan to see its pricing card.</p>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end', marginTop: 'var(--space-lg)' }}>
                            <button className="btn btn-ghost" onClick={close}>
                                <X size={14} /> Cancel
                            </button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                <Check size={14} /> {saving ? 'Saving...' : (showCreate ? 'Create Plan' : 'Save Changes')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Wrapping the control in its <label> ties the text to it (screen readers, clicks).
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label style={{ display: 'block', marginTop: 'var(--space-sm)' }}>
            <span style={labelStyle}>{label}</span>
            {children}
        </label>
    );
}

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '13px',
    color: 'var(--color-text-secondary)', marginBottom: '4px'
};
const sectionStyle: React.CSSProperties = { fontSize: 14, fontWeight: 600, margin: 'var(--space-lg) 0 var(--space-xs)' };
const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 var(--space-md)' };
const hintStyle: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 };
