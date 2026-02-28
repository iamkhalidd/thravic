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
    current_period_end: string;
    created_at: string;
}

const PLAN_COLORS: Record<string, string> = {
    free: '#606072',
    growth: '#6c5ce7',
    pro: '#ffaa00',
    enterprise: '#00d68f'
};

export default function SubscriptionsPage() {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [revenue, setRevenue] = useState<{ plan: string; count: string; revenue: string }[]>([]);
    const [total, setTotal] = useState(0);
    const [plan, setPlan] = useState('');
    const [loading, setLoading] = useState(true);
    const [editSub, setEditSub] = useState<Subscription | null>(null);
    const [editForm, setEditForm] = useState({ plan: '', events_limit: 0, domains_limit: 0 });

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
        setEditForm({ plan: sub.plan, events_limit: sub.events_limit, domains_limit: sub.domains_limit });
    };

    const handleSave = async () => {
        if (!editSub) return;
        try {
            await api.patch(`/api/admin/subscriptions/${editSub.id}`, editForm);
            setEditSub(null);
            loadData();
        } catch (err: any) { alert(err.message); }
    };

    const totalMRR = revenue.reduce((sum, r) => sum + parseFloat(r.revenue || '0'), 0);
    const pieData = revenue.filter(r => parseInt(r.count) > 0);

    return (
        <div>
            {/* Revenue overview */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(255,170,0,0.12)' }}>
                        <DollarSign size={22} color="#ffaa00" />
                    </div>
                    <div>
                        <div className="stat-value">${totalMRR.toLocaleString()}</div>
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
                            <span style={{ color: 'var(--color-text-primary)' }}>{r.count} subs — ${parseFloat(r.revenue || '0').toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Filter */}
            <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-md)', alignItems: 'center' }}>
                <select className="input" style={{ width: '180px' }} value={plan} onChange={e => setPlan(e.target.value)}>
                    <option value="">All Plans</option>
                    <option value="free">Free</option>
                    <option value="growth">Growth</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                </select>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>{total} total subscriptions</span>
            </div>

            {/* Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Plan</th>
                            <th>Status</th>
                            <th>Events Used</th>
                            <th>Events Limit</th>
                            <th>Domains Limit</th>
                            <th>Period End</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} className="loading"><div className="spinner" /></td></tr>
                        ) : subscriptions.map(sub => (
                            <tr key={sub.id}>
                                <td><span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{sub.user_name}</span><br /><span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{sub.user_email}</span></td>
                                <td><span className={`badge badge-${sub.plan}`}>{sub.plan}</span></td>
                                <td><span className={`badge badge-${sub.status}`}>{sub.status}</span></td>
                                <td>{sub.events_used?.toLocaleString()}</td>
                                <td>{sub.events_limit?.toLocaleString()}</td>
                                <td>{sub.domains_limit}</td>
                                <td>{sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : '—'}</td>
                                <td>
                                    <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(sub)} title="Edit"><Edit size={14} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Edit modal */}
            {editSub && (
                <div className="modal-overlay" onClick={() => setEditSub(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3 className="modal-title">Edit Subscription: {editSub.user_name}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Plan</label>
                                <select className="input" value={editForm.plan} onChange={e => setEditForm(f => ({ ...f, plan: e.target.value }))}>
                                    <option value="free">Free</option>
                                    <option value="growth">Growth</option>
                                    <option value="pro">Pro</option>
                                    <option value="enterprise">Enterprise</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Events Limit</label>
                                <input className="input" type="number" value={editForm.events_limit} onChange={e => setEditForm(f => ({ ...f, events_limit: parseInt(e.target.value) }))} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Domains Limit</label>
                                <input className="input" type="number" value={editForm.domains_limit} onChange={e => setEditForm(f => ({ ...f, domains_limit: parseInt(e.target.value) }))} />
                            </div>
                            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end', marginTop: 'var(--space-md)' }}>
                                <button className="btn btn-ghost" onClick={() => setEditSub(null)}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
