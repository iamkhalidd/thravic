'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '@/lib/api';
import { MaskedEmail } from '@/components/MaskedEmail';

interface Summary {
    mrr: {
        mrr: number;
        paying: number;
        grace: number;
        graceMrr: number;
        complimentary: number;
        byCurrency: Record<string, number>;
    };
    monthly: { month: string; revenue: string | number; payments: string | number }[];
    timezone: string;
}

interface Mismatch {
    reference: string;
    email?: string | null;
    currency?: string | null;
    paystackAmount?: number;
    thravicAmount?: number;
    thravicStatus?: string | null;
    plan?: string;
}

interface Reconcile {
    month: string;
    paystackTotal: number;
    thravicTotal: number;
    matched: number;
    amountMismatch: Mismatch[];
    paystackOnly: Mismatch[];
    thravicOnly: Mismatch[];
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;
const tooltipStyle = {
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    color: 'var(--color-text-primary)',
    fontSize: 12,
};
const axisTick = { fill: 'var(--chart-axis)', fontSize: 11 };

function monthLabel(month: string) {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

function thisMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function ProblemTable({ title, help, rows }: { title: string; help: string; rows: Mismatch[] }) {
    if (rows.length === 0) return null;
    return (
        <div style={{ marginTop: 'var(--space-lg)' }}>
            <div className="card-title" style={{ marginBottom: 4 }}>{title} ({rows.length})</div>
            <p className="card-subtitle" style={{ marginBottom: 8 }}>{help}</p>
            <div className="table-scroll">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Reference</th>
                            <th>Customer</th>
                            <th className="num">Paystack</th>
                            <th className="num">Thravic</th>
                            <th>Thravic status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.reference}>
                                <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{r.reference}</td>
                                <td className="muted">{r.email ? <MaskedEmail email={r.email} /> : '—'}</td>
                                <td className="num">{r.paystackAmount != null ? naira(r.paystackAmount) : '—'}</td>
                                <td className="num">{r.thravicAmount != null ? naira(r.thravicAmount) : '—'}</td>
                                <td>{r.thravicStatus === undefined ? 'success' : (r.thravicStatus ?? 'no record')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function RevenuePage() {
    const [summary, setSummary] = useState<Summary | null>(null);
    const [failed, setFailed] = useState('');
    const [month, setMonth] = useState(thisMonth());
    const [check, setCheck] = useState<Reconcile | null>(null);
    const [checking, setChecking] = useState(false);
    const [checkError, setCheckError] = useState('');

    useEffect(() => {
        api.get<Summary>('/api/admin/revenue/summary').then(setSummary).catch((e: Error) => setFailed(e.message));
    }, []);

    const runCheck = async () => {
        setChecking(true);
        setCheckError('');
        setCheck(null);
        try {
            setCheck(await api.get<Reconcile>(`/api/admin/revenue/reconcile?month=${month}`));
        } catch (e: any) {
            setCheckError(e.message);
        } finally {
            setChecking(false);
        }
    };

    if (failed) return <div className="card empty-note">Revenue could not be loaded: {failed}</div>;
    if (!summary) return <div className="skeleton" style={{ height: 300 }} />;

    const m = summary.mrr;
    const other = Object.entries(m.byCurrency).filter(([c]) => c !== 'NGN');
    const trend = summary.monthly.map(r => ({ month: monthLabel(r.month), revenue: Number(r.revenue) || 0 }));
    const problems = check ? check.amountMismatch.length + check.paystackOnly.length + check.thravicOnly.length : 0;

    return (
        <div className="page-stack">
            <div className="stat-grid">
                <div className="stat-card">
                    <span className="stat-label">MRR</span>
                    <span className="stat-value">{naira(m.mrr)}</span>
                    <span className="stat-hint">
                        {m.paying} paying account{m.paying === 1 ? '' : 's'}
                        {other.map(([c, v]) => ` · ${c} ${v.toLocaleString()}`).join('')}
                    </span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">At risk</span>
                    <span className="stat-value">{naira(m.graceMrr)}</span>
                    <span className="stat-hint">{m.grace} in grace days, not counted</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Free grants</span>
                    <span className="stat-value">{m.complimentary}</span>
                    <span className="stat-hint">Paid plans with no payment</span>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <div>
                        <div className="card-title">How MRR is counted</div>
                    </div>
                </div>
                <ul style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', paddingLeft: 18, lineHeight: 1.7 }}>
                    <li>Each paying account counts what it last paid for its plan, so promo discounts are already off.</li>
                    <li>Yearly plans count one twelfth of the payment per month.</li>
                    <li>Accounts whose period ended and are in the 3 grace days are shown as at risk, not counted.</li>
                    <li>Plans given by an admin, or bought with a 100% promo, are free grants and add nothing.</li>
                    <li>Months and &quot;today&quot; follow {summary.timezone.replace('_', ' ')} time.</li>
                </ul>
            </div>

            <div className="card">
                <div className="card-header">
                    <div>
                        <div className="card-title">Money received</div>
                        <div className="card-subtitle">Successful Paystack payments per month, in naira. A yearly plan lands in the month it was paid.</div>
                    </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={trend} margin={{ top: 4, right: 4, left: 8, bottom: 0 }}>
                        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                        <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} />
                        <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => `₦${(v / 1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => naira(v)} cursor={{ fill: 'var(--color-bg-hover)' }} />
                        <Bar dataKey="revenue" name="Received" fill="var(--brand)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="card">
                <div className="card-header">
                    <div>
                        <div className="card-title">Check against Paystack</div>
                        <div className="card-subtitle">
                            Compares a month of successful payments in Paystack with Thravic&apos;s records. Run it once a month.
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input className="input" type="month" value={month} max={thisMonth()} onChange={e => setMonth(e.target.value)} style={{ width: 180 }} aria-label="Month to check" />
                    <button className="btn btn-primary" onClick={runCheck} disabled={checking || !month}>
                        {checking ? 'Checking...' : 'Run check'}
                    </button>
                </div>
                {checkError && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginTop: 12 }}>{checkError}</p>}
                {check && (
                    <div style={{ marginTop: 'var(--space-lg)' }}>
                        <p style={{ fontSize: '0.875rem' }}>
                            {problems === 0
                                ? <><strong>Everything matches.</strong> {check.matched} payments, {naira(check.paystackTotal)} in both.</>
                                : <><strong>{problems} to look at.</strong> {check.matched} matched. Paystack {naira(check.paystackTotal)}, Thravic {naira(check.thravicTotal)}.</>}
                        </p>
                        <ProblemTable
                            title="Paid in Paystack, missing in Thravic"
                            help="The customer paid but may not have their plan. The hourly payment check usually fixes these; if one stays, grant the plan from Users."
                            rows={check.paystackOnly}
                        />
                        <ProblemTable
                            title="In Thravic, not in Paystack"
                            help="Thravic shows a payment Paystack does not list as successful (refunded, reversed or a test). Check it in the Paystack dashboard."
                            rows={check.thravicOnly}
                        />
                        <ProblemTable
                            title="Different amounts"
                            help="Both have the payment but the amounts differ."
                            rows={check.amountMismatch}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
