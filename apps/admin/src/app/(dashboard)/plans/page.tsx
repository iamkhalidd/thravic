'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Edit, Plus, Check, X, ToggleLeft, ToggleRight } from 'lucide-react';

interface Plan {
    id: string;
    name: string;
    price: number;
    currency: string;
    interval: string;
    events_limit: number;
    domains_limit: number;
    retention_days: number;
    features: string[];
    active: boolean;
    sort_order: number;
}

const CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR'];

function formatPrice(price: number, currency: string) {
    const symbols: Record<string, string> = { NGN: '₦', USD: '$', GBP: '£', EUR: '€' };
    return `${symbols[currency] || currency}${price.toLocaleString()}`;
}

export default function PlansPage() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [editPlan, setEditPlan] = useState<Plan | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Edit form state
    const [form, setForm] = useState({
        id: '', name: '', price: 0, currency: 'NGN', interval: 'monthly',
        events_limit: 0, domains_limit: 0, retention_days: 30,
        features: '' as string, active: true, sort_order: 0
    });

    const loadPlans = async () => {
        setLoading(true);
        try {
            const data = await api.get('/api/admin/plans');
            setPlans(data.plans || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadPlans(); }, []);

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
            retention_days: plan.retention_days,
            features: plan.features.join(', '),
            active: plan.active,
            sort_order: plan.sort_order,
        });
    };

    const openCreate = () => {
        setEditPlan(null);
        setShowCreate(true);
        setForm({
            id: '', name: '', price: 0, currency: 'NGN', interval: 'monthly',
            events_limit: 5000, domains_limit: 1, retention_days: 30,
            features: '', active: true, sort_order: plans.length
        });
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const payload = {
                ...form,
                features: form.features.split(',').map(f => f.trim()).filter(Boolean),
            };

            if (showCreate) {
                await api.post('/api/admin/plans', payload);
                setMessage({ type: 'success', text: `Plan "${form.name}" created successfully` });
                setShowCreate(false);
            } else if (editPlan) {
                const { id, ...updateData } = payload;
                await api.put(`/api/admin/plans/${editPlan.id}`, updateData);
                setMessage({ type: 'success', text: `Plan "${form.name}" updated successfully` });
                setEditPlan(null);
            }
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
            setMessage({ type: 'success', text: `${plan.name} ${plan.active ? 'hidden' : 'activated'}` });
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        }
    };

    const isEditing = editPlan || showCreate;

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
                <div>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>
                        Manage plan pricing, features, and limits. Changes take effect immediately.
                    </p>
                </div>
                <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Plus size={16} /> New Plan
                </button>
            </div>

            {/* Status message */}
            {message && (
                <div className={`card`} style={{
                    marginBottom: 'var(--space-md)',
                    padding: 'var(--space-sm) var(--space-md)',
                    background: message.type === 'success' ? 'rgba(0,214,143,0.1)' : 'rgba(255,85,85,0.1)',
                    borderLeft: `3px solid ${message.type === 'success' ? '#00d68f' : '#ff5555'}`,
                }}>
                    {message.text}
                </div>
            )}

            {/* Plans table */}
            <div className="table-scroll">
                <div className="card" style={{ padding: 0, overflow: 'hidden', minWidth: '800px' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Plan</th>
                                <th>Price</th>
                                <th>Interval</th>
                                <th>Events Limit</th>
                                <th>Domains</th>
                                <th>Retention</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} className="loading"><div className="spinner" /></td></tr>
                            ) : plans.length === 0 ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>No plans configured. Click &quot;New Plan&quot; to create one.</td></tr>
                            ) : plans.map(plan => (
                                <tr key={plan.id} style={{ opacity: plan.active ? 1 : 0.5 }}>
                                    <td>
                                        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{plan.name}</span>
                                        <br /><span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{plan.id}</span>
                                    </td>
                                    <td style={{ fontWeight: 600, fontSize: '15px' }}>{formatPrice(plan.price, plan.currency)}</td>
                                    <td><span className="badge">{plan.interval}</span></td>
                                    <td>{plan.events_limit.toLocaleString()}</td>
                                    <td>{plan.domains_limit}</td>
                                    <td>{plan.retention_days} days</td>
                                    <td>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => toggleActive(plan)}
                                            title={plan.active ? 'Hide plan' : 'Activate plan'}
                                            style={{ color: plan.active ? '#00d68f' : '#666' }}
                                        >
                                            {plan.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                        </button>
                                    </td>
                                    <td>
                                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(plan)} title="Edit">
                                            <Edit size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit/Create modal */}
            {isEditing && (
                <div className="modal-overlay" onClick={() => { setEditPlan(null); setShowCreate(false); }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                        <h3 className="modal-title">{showCreate ? 'Create New Plan' : `Edit: ${editPlan?.name}`}</h3>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                            {showCreate && (
                                <div>
                                    <label style={labelStyle}>Plan ID</label>
                                    <input className="input" value={form.id} placeholder="e.g. starter"
                                        onChange={e => setForm(f => ({ ...f, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))} />
                                </div>
                            )}
                            <div>
                                <label style={labelStyle}>Display Name</label>
                                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                            </div>
                            <div>
                                <label style={labelStyle}>Price (whole units)</label>
                                <input className="input" type="number" min={0} value={form.price}
                                    onChange={e => setForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))} />
                            </div>
                            <div>
                                <label style={labelStyle}>Currency</label>
                                <select className="input" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Interval</label>
                                <select className="input" value={form.interval} onChange={e => setForm(f => ({ ...f, interval: e.target.value }))}>
                                    <option value="monthly">Monthly</option>
                                    <option value="yearly">Yearly</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Events Limit</label>
                                <input className="input" type="number" min={0} value={form.events_limit}
                                    onChange={e => setForm(f => ({ ...f, events_limit: parseInt(e.target.value) || 0 }))} />
                            </div>
                            <div>
                                <label style={labelStyle}>Domains Limit</label>
                                <input className="input" type="number" min={0} value={form.domains_limit}
                                    onChange={e => setForm(f => ({ ...f, domains_limit: parseInt(e.target.value) || 0 }))} />
                            </div>
                            <div>
                                <label style={labelStyle}>Retention (days)</label>
                                <input className="input" type="number" min={1} value={form.retention_days}
                                    onChange={e => setForm(f => ({ ...f, retention_days: parseInt(e.target.value) || 30 }))} />
                            </div>
                            <div>
                                <label style={labelStyle}>Sort Order</label>
                                <input className="input" type="number" min={0} value={form.sort_order}
                                    onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} />
                            </div>
                        </div>

                        <div style={{ marginTop: 'var(--space-md)' }}>
                            <label style={labelStyle}>Features (comma-separated)</label>
                            <input className="input" value={form.features} placeholder="analytics, heatmaps, recordings, export"
                                onChange={e => setForm(f => ({ ...f, features: e.target.value }))} />
                        </div>

                        <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end', marginTop: 'var(--space-lg)' }}>
                            <button className="btn btn-ghost" onClick={() => { setEditPlan(null); setShowCreate(false); }}>
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

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '13px',
    color: 'var(--color-text-secondary)', marginBottom: '4px'
};
