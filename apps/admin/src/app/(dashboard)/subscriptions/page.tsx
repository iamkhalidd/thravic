'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Edit, DollarSign } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface Subscription {
    id: string;
    user_id: string;
    plan: string;
    status: string;
    events_limit: number;
    events_used: number;
    domains_limit: number;
    user_name: string;
    user_email: string;
    current_period_end: string | null;
    created_at: string;
    /** free | active | grace | expired | canceled */
    state: string;
    grace_ends_at: string | null;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

const PLAN_COLORS: Record<string, string> = {
    free: '#606072',
    pro: '#6c5ce7',
    agency: '#00d68f'
};

export default function SubscriptionsPage() {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [revenue, setRevenue] = useState<{ plan: string; count: string; revenue: string }[]>([]);
    const [total, setTotal] = useState(0);
    const [plan, setPlan] = useState('');
    const [loading, setLoading] = useState(true);
    const [editSub, setEditSub] = useState<Subscription | null>(null);
    const [editForm, setEditForm] = useState({ plan: '' });
    const [extendDays, setExtendDays] = useState(30);
    const [plans, setPlans] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        api.get('/api/admin/plans').then(data => setPlans(data.plans || [])).catch(console.error);
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (plan) params.set('plan', plan);
            const data = await api.get(`/api/admin/subscriptions?${params}`);
            setSubscriptions(data.subscriptions);
            setRevenue(data.revenue);
            setTotal(data.total);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [plan]);

    const handleEdit = (sub: Subscription) => {
        setEditSub(sub);
        setEditForm({ plan: sub.plan });
    };

    const handleSave = async () => {
        if (!editSub) return;
        try {
            await api.patch(`/api/admin/subscriptions/${editSub.id}`, editForm);
            setEditSub(null);
            loadData();
        } catch (err: any) { alert(err.message); }
    };

    const handleExtend = async () => {
        if (!editSub) return;
        try {
            await api.post(`/api/admin/subscriptions/${editSub.id}/extend`, { days: extendDays });
            setEditSub(null);
            loadData();
        } catch (err: any) { alert(err.message); }
    };

    const totalMRR = revenue.reduce((sum, r) => sum + parseFloat(r.revenue || '0'), 0);
    const pieData = revenue.filter(r => parseInt(r.count) > 0);

    return (
        <div>
            {/* Revenue overview */}
            <div className="admin-grid-3">
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(255,170,0,0.12)' }}>
                        <DollarSign size={22} color="#ffaa00" />
                    </div>
                    <div>
                        <div className="stat-value">₦{totalMRR.toLocaleString()}</div>
                        <div className="stat-label">Monthly Recurring Revenue</div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-title" style={{ marginBottom: 'var(--space-sm)' }}>Plan Distribution</div>
                    {pieData.length === 0 ? (
                        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>No paid subscribers yet</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={120}>
                            <PieChart>
                                <Pie data={pieData.map(r => ({ name: r.plan, value: parseInt(r.count) }))} cx="50%" cy="50%" innerRadius={35} outerRadius={50} dataKey="value">
                                    {pieData.map((r, i) => <Cell key={i} fill={PLAN_COLORS[r.plan] || '#666'} />)}
                                </Pie>
                                <Tooltip contentStyle={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text-primary)' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>

                <div className="card">
                    <div className="card-title" style={{ marginBottom: 'var(--space-sm)' }}>Revenue by Plan</div>
                    {revenue.length === 0 ? (
                        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>No revenue data yet</div>
                    ) : revenue.map(r => (
                        <div key={r.plan} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                            <span><span className={`badge badge-${r.plan}`}>{r.plan}</span></span>
                            <span style={{ color: 'var(--color-text-primary)' }}>{r.count} subs — ₦{parseFloat(r.revenue || '0').toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Filter */}
            <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-md)', alignItems: 'center' }}>
                <select className="input" style={{ width: '180px' }} value={plan} onChange={e => setPlan(e.target.value)}>
                    <option value="">All Plans</option>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>{total} total subscriptions</span>
            </div>

            {/* Table */}
            <div className="table-scroll">
                <div className="card" style={{ padding: 0, overflow: 'hidden', minWidth: '700px' }}>
                    <table className="data-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Plan</th>
                            <th>State</th>
                            <th>Paid Until</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} className="loading"><div className="spinner" /></td></tr>
                        ) : subscriptions.map(sub => (
                            <tr key={sub.id}>
                                <td><span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{sub.user_name}</span><br /><span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{sub.user_email}</span></td>
                                <td><span className={`badge badge-${sub.plan}`}>{sub.plan}</span></td>
                                <td><span className={`badge badge-${sub.state}`}>{sub.state}</span></td>
                                <td>
                                    {sub.current_period_end ? fmtDate(sub.current_period_end) : (sub.plan === 'free' ? '—' : 'No end date')}
                                    {sub.state === 'grace' && sub.grace_ends_at && (
                                        <><br /><span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>access until {fmtDate(sub.grace_ends_at)}</span></>
                                    )}
                                </td>
                                <td>
                                    <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(sub)} title="Edit"><Edit size={14} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    </table>
                </div>
            </div>

            {/* Edit modal */}
            {editSub && (
                <div className="modal-overlay" onClick={() => setEditSub(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3 className="modal-title">Edit Subscription: {editSub.user_name}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                            <div>
                                <label htmlFor="sub-plan" style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Plan</label>
                                <select id="sub-plan" className="input" value={editForm.plan} onChange={e => setEditForm({ plan: e.target.value })}>
                                    {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                    Limits and features come from the plan&apos;s definition (Plans page).
                                </p>
                            </div>
                            {editSub.plan !== 'free' && (
                                <div>
                                    <label htmlFor="extend-days" style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                                        Extend paid period
                                    </label>
                                    {editSub.current_period_end ? (
                                        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                                            <input id="extend-days" className="input" type="number" min={1} max={365} style={{ width: '100px' }}
                                                value={extendDays} onChange={e => setExtendDays(parseInt(e.target.value) || 0)} />
                                            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>days</span>
                                            <button className="btn btn-ghost btn-sm" onClick={handleExtend} disabled={extendDays < 1 || extendDays > 365}>Extend</button>
                                        </div>
                                    ) : (
                                        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>No end date: this plan doesn&apos;t expire.</p>
                                    )}
                                    {editSub.current_period_end && (
                                        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                            Paid until {fmtDate(editSub.current_period_end)}; extends from then, or from today if it has lapsed.
                                        </p>
                                    )}
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'space-between', marginTop: 'var(--space-md)' }}>
                                <button className="btn btn-danger btn-sm" onClick={async () => {
                                    if (confirm('End this paid plan now? The account moves to the free plan immediately.')) {
                                        try {
                                            await api.post(`/api/admin/subscriptions/${editSub.id}/cancel`, {});
                                            setEditSub(null);
                                            loadData();
                                        } catch (err: any) { alert(err.message); }
                                    }
                                }}>End access now</button>
                                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                                    <button className="btn btn-ghost" onClick={() => setEditSub(null)}>Close</button>
                                    <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
