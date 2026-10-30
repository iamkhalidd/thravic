'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { RefreshCw } from 'lucide-react';

interface Usage {
    calls: number;
    failed: number;
    prompt_tokens: number;
    completion_tokens: number;
    cost: number;
}

interface AiData {
    days: number;
    configured: boolean;
    model: string;
    prices: { inputPerM: number; outputPerM: number };
    totals: Usage;
    daily: (Usage & { day: string })[];
    features: (Usage & { feature: string })[];
    accounts: (Usage & { user_id: string; email: string; name: string; plan: string })[];
}

const FEATURES: Record<string, string> = {
    insights: 'Insights (dashboard and emails)',
    explain: 'Explain this chart',
    assistant: 'Ask Thravic',
};

const RANGES = [7, 30, 90, 365];

const money = (n: number) => `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`;
const tokens = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);

function UsageCells({ u }: { u: Usage }) {
    return (
        <>
            <td className="num">{u.calls.toLocaleString()}</td>
            <td className="num muted">{u.failed ? u.failed.toLocaleString() : '—'}</td>
            <td className="num muted">{tokens(u.prompt_tokens)}</td>
            <td className="num muted">{tokens(u.completion_tokens)}</td>
            <td className="num" style={{ paddingRight: 20 }}>{money(u.cost)}</td>
        </>
    );
}

function UsageHeads() {
    return (
        <>
            <th className="num">Calls</th>
            <th className="num">Failed</th>
            <th className="num">Tokens in</th>
            <th className="num">Tokens out</th>
            <th className="num" style={{ paddingRight: 20 }}>Est. cost</th>
        </>
    );
}

function UsageTable<T extends Usage>({ title, subtitle, first, rows, rowKey, label }: {
    title: string;
    subtitle: string;
    first: string;
    rows: T[];
    rowKey: (row: T) => string;
    label: (row: T) => React.ReactNode;
}) {
    return (
        <div className="card card-flush">
            <div className="card-header">
                <div>
                    <div className="card-title">{title}</div>
                    <div className="card-subtitle">{subtitle}</div>
                </div>
            </div>
            <div className="table-scroll" style={{ marginTop: 8 }}>
                <table className="data-table">
                    <thead><tr><th style={{ paddingLeft: 20 }}>{first}</th><UsageHeads /></tr></thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr><td colSpan={6} className="empty-state">No AI calls in this period</td></tr>
                        ) : rows.map(row => (
                            <tr key={rowKey(row)}>
                                <td style={{ paddingLeft: 20 }}>{label(row)}</td>
                                <UsageCells u={row} />
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function AiUsagePage() {
    const [days, setDays] = useState(30);
    const [data, setData] = useState<AiData | null>(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try { setData(await api.get<AiData>(`/api/admin/ai?days=${days}`)); }
        catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [days]);

    if (loading && !data) return <div className="loading"><div className="spinner" /></div>;
    if (!data) return <div className="card empty-note">AI usage could not be loaded.</div>;

    const t = data.totals;
    const tiles = [
        { label: 'Calls', value: t.calls.toLocaleString(), hint: `Last ${data.days} days` },
        {
            label: 'Failed',
            value: t.failed.toLocaleString(),
            hint: t.calls ? `${Math.round((t.failed / t.calls) * 100)}% of calls` : 'No calls',
            tone: t.failed ? 'var(--color-danger)' : undefined,
        },
        { label: 'Tokens', value: tokens(t.prompt_tokens + t.completion_tokens), hint: `${tokens(t.prompt_tokens)} in, ${tokens(t.completion_tokens)} out` },
        { label: 'Estimated cost', value: money(t.cost), hint: `US dollars, ${data.model}` },
    ];

    return (
        <div className="page-stack">
            <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
                {RANGES.map(r => (
                    <button key={r} className={`btn btn-sm ${r === days ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDays(r)}>
                        {r === 365 ? '1 year' : `${r} days`}
                    </button>
                ))}
                <button className="btn btn-secondary btn-sm" onClick={load} style={{ marginLeft: 'auto' }}><RefreshCw size={14} /> Refresh</button>
            </div>

            {!data.configured && (
                <div className="card empty-note">
                    No AI key is set (AI_API_KEY), so insights use the built-in rules and nothing new is counted here.
                </div>
            )}

            <div className="stat-grid">
                {tiles.map(tile => (
                    <div key={tile.label} className="stat-card">
                        <span className="stat-label">{tile.label}</span>
                        <span className="stat-value" style={{ fontSize: '1.25rem', color: tile.tone }}>{tile.value}</span>
                        <span className="stat-hint">{tile.hint}</span>
                    </div>
                ))}
            </div>

            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
                Cost is an estimate at ${data.prices.inputPerM} per million tokens in and ${data.prices.outputPerM} out
                (AI_PRICE_INPUT_PER_M and AI_PRICE_OUTPUT_PER_M). Cache discounts are not counted, so the real bill is usually lower.
            </p>

            <UsageTable
                title="By feature"
                subtitle="What the calls were for"
                first="Feature"
                rows={data.features}
                rowKey={f => f.feature}
                label={f => FEATURES[f.feature] ?? f.feature}
            />

            <UsageTable
                title="Top accounts"
                subtitle="The 20 accounts that used the most tokens"
                first="Account"
                rows={data.accounts}
                rowKey={a => a.user_id}
                label={a => (
                    <>
                        <div style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
                            {a.name} <span className="badge" style={{ marginLeft: 6 }}>{a.plan}</span>
                        </div>
                        {a.name !== a.email && <div className="muted" style={{ fontSize: 12 }}>{a.email}</div>}
                    </>
                )}
            />

            <UsageTable
                title="By day"
                subtitle="UTC days, newest first"
                first="Day"
                rows={[...data.daily].reverse()}
                rowKey={d => d.day}
                label={d => d.day}
            />
        </div>
    );
}
