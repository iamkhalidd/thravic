'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Edit, Trash2, Copy, Check, X, ToggleLeft, ToggleRight } from 'lucide-react';

interface PromoCode {
    id: string;
    code: string;
    discount_type: 'percentage' | 'flat';
    discount_value: number;
    applicable_plans: string[];
    max_uses: number | null;
    max_per_user: number;
    used_count: number;
    starts_at: string | null;
    expires_at: string | null;
    active: boolean;
    created_at: string;
    total_redemptions: string;
    total_discount_given: string;
}

export default function PromosPage() {
    const [promos, setPromos] = useState<PromoCode[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editPromo, setEditPromo] = useState<PromoCode | null>(null);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const [form, setForm] = useState({
        code: '', discount_type: 'percentage' as 'percentage' | 'flat', discount_value: 10,
        applicable_plans: [] as string[], max_uses: null as number | null,
        max_per_user: 1, starts_at: '', expires_at: '', active: true,
    });

    const loadPromos = async () => {
        setLoading(true);
        try {
            const data = await api.get('/api/admin/promos');
            setPromos(data.promos || []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadPromos(); }, []);

    const openCreate = () => {
        setEditPromo(null);
        setForm({
            code: '', discount_type: 'percentage', discount_value: 10,
            applicable_plans: [], max_uses: null, max_per_user: 1,
            starts_at: '', expires_at: '', active: true,
        });
        setShowForm(true);
    };

    const openEdit = (promo: PromoCode) => {
        setEditPromo(promo);
        setForm({
            code: promo.code,
            discount_type: promo.discount_type,
            discount_value: promo.discount_value,
            applicable_plans: promo.applicable_plans || [],
            max_uses: promo.max_uses,
            max_per_user: promo.max_per_user,
            starts_at: promo.starts_at ? promo.starts_at.slice(0, 16) : '',
            expires_at: promo.expires_at ? promo.expires_at.slice(0, 16) : '',
            active: promo.active,
        });
        setShowForm(true);
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const payload = {
                ...form,
                max_uses: form.max_uses || null,
                starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
                expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
            };

            if (editPromo) {
                await api.put(`/api/admin/promos/${editPromo.id}`, payload);
                setMessage({ type: 'success', text: `Promo "${form.code}" updated` });
            } else {
                await api.post('/api/admin/promos', payload);
                setMessage({ type: 'success', text: `Promo "${form.code}" created` });
            }
            setShowForm(false);
            loadPromos();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Failed to save promo' });
        } finally { setSaving(false); }
    };

    const toggleActive = async (promo: PromoCode) => {
        try {
            await api.put(`/api/admin/promos/${promo.id}`, { active: !promo.active });
            loadPromos();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        }
    };

    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        setCopied(code);
        setTimeout(() => setCopied(''), 2000);
    };

    const handlePlanToggle = (plan: string) => {
        setForm(f => ({
            ...f,
            applicable_plans: f.applicable_plans.includes(plan)
                ? f.applicable_plans.filter(p => p !== plan)
                : [...f.applicable_plans, plan]
        }));
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>
                    Create discount codes for subscriptions. Codes are validated server-side with rate limiting.
                </p>
                <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Plus size={16} /> New Promo
                </button>
            </div>

            {message && (
                <div className="card" style={{
                    marginBottom: 'var(--space-md)', padding: 'var(--space-sm) var(--space-md)',
                    background: message.type === 'success' ? 'rgba(0,214,143,0.1)' : 'rgba(255,85,85,0.1)',
                    borderLeft: `3px solid ${message.type === 'success' ? '#00d68f' : '#ff5555'}`,
                }}>{message.text}</div>
            )}

            <div className="table-scroll">
                <div className="card" style={{ padding: 0, overflow: 'hidden', minWidth: '800px' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Discount</th>
                                <th>Plans</th>
                                <th>Usage</th>
                                <th>Expires</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7} className="loading"><div className="spinner" /></td></tr>
                            ) : promos.length === 0 ? (
                                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>No promo codes yet</td></tr>
                            ) : promos.map(promo => (
                                <tr key={promo.id} style={{ opacity: promo.active ? 1 : 0.5 }}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <code style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-accent)', background: 'var(--color-bg-tertiary)', padding: '2px 8px', borderRadius: '4px' }}>
                                                {promo.code}
                                            </code>
                                            <button className="btn btn-ghost btn-sm" onClick={() => copyCode(promo.code)} title="Copy code">
                                                {copied === promo.code ? <Check size={12} color="#00d68f" /> : <Copy size={12} />}
                                            </button>
                                        </div>
                                    </td>
                                    <td style={{ fontWeight: 600 }}>
                                        {promo.discount_type === 'percentage' ? `${promo.discount_value}%` : `₦${promo.discount_value.toLocaleString()}`}
                                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: '4px' }}>
                                            {promo.discount_type === 'percentage' ? 'off' : 'flat'}
                                        </span>
                                    </td>
                                    <td>
                                        {(!promo.applicable_plans || promo.applicable_plans.length === 0)
                                            ? <span className="badge">All plans</span>
                                            : promo.applicable_plans.map(p => <span key={p} className={`badge badge-${p}`} style={{ marginRight: '4px' }}>{p}</span>)
                                        }
                                    </td>
                                    <td>
                                        <span style={{ fontWeight: 500 }}>{promo.used_count}</span>
                                        <span style={{ color: 'var(--color-text-muted)' }}>
                                            {promo.max_uses ? ` / ${promo.max_uses}` : ' / ∞'}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: '13px' }}>
                                        {promo.expires_at ? new Date(promo.expires_at).toLocaleDateString() : '—'}
                                    </td>
                                    <td>
                                        <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(promo)}
                                            style={{ color: promo.active ? '#00d68f' : '#666' }}>
                                            {promo.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                        </button>
                                    </td>
                                    <td>
                                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(promo)} title="Edit">
                                            <Edit size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create/Edit modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                        <h3 className="modal-title">{editPromo ? `Edit: ${editPromo.code}` : 'Create Promo Code'}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                            <div>
                                <label style={labelStyle}>Code</label>
                                <input className="input" value={form.code} placeholder="e.g. LAUNCH50"
                                    style={{ textTransform: 'uppercase' }}
                                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                                <div>
                                    <label style={labelStyle}>Discount Type</label>
                                    <select className="input" value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value as any }))}>
                                        <option value="percentage">Percentage (%)</option>
                                        <option value="flat">Flat Amount (₦)</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>{form.discount_type === 'percentage' ? 'Percentage' : 'Amount (₦)'}</label>
                                    <input className="input" type="number" min={1} max={form.discount_type === 'percentage' ? 100 : undefined}
                                        value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: parseInt(e.target.value) || 0 }))} />
                                </div>
                            </div>
                            <div>
                                <label style={labelStyle}>Applicable Plans (empty = all)</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {['pro', 'agency'].map(p => (
                                        <button key={p} className={`btn btn-sm ${form.applicable_plans.includes(p) ? 'btn-primary' : 'btn-ghost'}`}
                                            onClick={() => handlePlanToggle(p)}>{p}</button>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                                <div>
                                    <label style={labelStyle}>Max Total Uses</label>
                                    <input className="input" type="number" min={1} placeholder="Unlimited"
                                        value={form.max_uses || ''} onChange={e => setForm(f => ({ ...f, max_uses: parseInt(e.target.value) || null }))} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Max Per User</label>
                                    <input className="input" type="number" min={1} value={form.max_per_user}
                                        onChange={e => setForm(f => ({ ...f, max_per_user: parseInt(e.target.value) || 1 }))} />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                                <div>
                                    <label style={labelStyle}>Starts At (optional)</label>
                                    <input className="input" type="datetime-local" value={form.starts_at}
                                        onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Expires At (optional)</label>
                                    <input className="input" type="datetime-local" value={form.expires_at}
                                        onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end', marginTop: 'var(--space-lg)' }}>
                            <button className="btn btn-ghost" onClick={() => setShowForm(false)}><X size={14} /> Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                <Check size={14} /> {saving ? 'Saving...' : (editPromo ? 'Save Changes' : 'Create Promo')}
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
