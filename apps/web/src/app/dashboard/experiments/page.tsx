'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDomain } from '@/contexts/DomainContext';
import { useSubscription } from '@/hooks/useSubscription';
import { UpgradeGate } from '@/components/UpgradeGate';
import { Plus, Trash2, Play, Square, BarChart3, Pencil, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';
import { isApp } from '@/lib/platform';
import {
    experiments as experimentsApi,
    type Experiment,
    type ExperimentInput,
    type ExperimentResult,
    type ExperimentStatus,
    type ExperimentVariant,
} from '@/lib/api';

const STATUS_BADGE: Record<ExperimentStatus, { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'badge' },
    active: { label: 'Running', className: 'badge badge-success' },
    ended: { label: 'Ended', className: 'badge badge-orange' },
};

const VERDICT_TEXT: Record<ExperimentResult['status'], string> = {
    winner: 'There is a clear winner.',
    no_difference: 'The versions perform about the same. Keep the simplest one.',
    too_early: 'Too early to tell. Keep the test running.',
    no_data: 'No visitors have seen this test yet.',
};

const NEW_VARIANTS: ExperimentVariant[] = [
    { id: 'a', name: 'Original', weight: 50 },
    { id: 'b', name: 'Version B', weight: 50 },
];

/** The next unused one-letter id: a, b, c… */
function nextVariantId(variants: ExperimentVariant[]): string {
    const used = new Set(variants.map(v => v.id));
    for (let code = 97; code <= 122; code++) {
        const id = String.fromCharCode(code);
        if (!used.has(id)) return id;
    }
    return `v${variants.length + 1}`;
}

function pct(value: number | null, digits = 1): string {
    return value === null ? '—' : `${(value * 100).toFixed(digits)}%`;
}

function signedPct(value: number | null): string {
    if (value === null) return '—';
    const text = pct(value);
    return value > 0 ? `+${text}` : text;
}

export default function ExperimentsPage() {
    const { selectedDomainId, selectedDomain } = useDomain();
    const { hasFeature, loading: subLoading } = useSubscription();
    const enabled = hasFeature('experiments', selectedDomain?.features || undefined);

    const [list, setList] = useState<Experiment[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // The form: null when closed, 'new' or the experiment being edited.
    const [editing, setEditing] = useState<Experiment | 'new' | null>(null);
    const [name, setName] = useState('');
    const [key, setKey] = useState('');
    const [goal, setGoal] = useState('');
    const [traffic, setTraffic] = useState(100);
    const [variants, setVariants] = useState<ExperimentVariant[]>(NEW_VARIANTS);
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const [openId, setOpenId] = useState<string | null>(null);
    const [results, setResults] = useState<ExperimentResult | null>(null);
    const [resultsLoading, setResultsLoading] = useState(false);

    const load = useCallback(async () => {
        if (!selectedDomainId) return;
        setLoading(true);
        const result = await experimentsApi.list(selectedDomainId);
        setList(result.data || []);
        if (result.error) setMessage({ type: 'error', text: result.error });
        setLoading(false);
    }, [selectedDomainId]);

    useEffect(() => {
        if (enabled && selectedDomainId) {
            load();
        } else {
            setLoading(false);
        }
    }, [enabled, selectedDomainId, load]);

    const openForm = (experiment: Experiment | 'new') => {
        setEditing(experiment);
        setMessage(null);
        if (experiment === 'new') {
            setName('');
            setKey('');
            setGoal('');
            setTraffic(100);
            setVariants(NEW_VARIANTS);
        } else {
            setName(experiment.name);
            setKey(experiment.key);
            setGoal(experiment.goal_event || '');
            setTraffic(experiment.traffic_allocation);
            setVariants(experiment.variants);
        }
    };

    const setVariant = (index: number, patch: Partial<ExperimentVariant>) => {
        setVariants(prev => prev.map((v, i) => i === index ? { ...v, ...patch } : v));
    };

    const addVariant = () => {
        setVariants(prev => [...prev, { id: nextVariantId(prev), name: `Version ${nextVariantId(prev).toUpperCase()}`, weight: 0 }]);
    };

    const totalWeight = variants.reduce((sum, v) => sum + (Number(v.weight) || 0), 0);

    const inputFor = (experiment: Experiment, status: ExperimentStatus): ExperimentInput => ({
        name: experiment.name,
        key: experiment.key,
        status,
        variants: experiment.variants,
        trafficAllocation: experiment.traffic_allocation,
        goalEvent: experiment.goal_event,
    });

    const replace = (updated: Experiment) => {
        setList(prev => prev.map(e => e.id === updated.id ? updated : e));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDomainId || !editing || !name.trim()) return;

        setSaving(true);
        setMessage(null);
        const input: ExperimentInput = {
            name: name.trim(),
            key: key.trim() || undefined,
            status: editing === 'new' ? 'draft' : editing.status,
            variants: variants.map(v => ({ ...v, name: v.name.trim() || v.id, weight: Number(v.weight) || 0 })),
            trafficAllocation: traffic,
            goalEvent: goal.trim() || null,
        };
        const result = editing === 'new'
            ? await experimentsApi.create(selectedDomainId, input)
            : await experimentsApi.update(selectedDomainId, editing.id, input);
        if (result.error) {
            setMessage({ type: 'error', text: result.error });
        } else if (result.data) {
            if (editing === 'new') setList(prev => [result.data!, ...prev]);
            else replace(result.data);
            setEditing(null);
            setMessage({ type: 'success', text: editing === 'new' ? 'Test added as a draft. Start it when your code is in place.' : 'Test saved' });
        }
        setSaving(false);
    };

    const handleStatus = async (experiment: Experiment, status: ExperimentStatus) => {
        if (!selectedDomainId) return;
        if (status === 'ended' && !confirm('End this test? Visitors stop being split and everyone sees the original.')) return;
        setBusyId(experiment.id);
        setMessage(null);
        const result = await experimentsApi.update(selectedDomainId, experiment.id, inputFor(experiment, status));
        if (result.error) setMessage({ type: 'error', text: result.error });
        else if (result.data) replace(result.data);
        setBusyId(null);
    };

    const handleRemove = async (experiment: Experiment) => {
        if (!selectedDomainId || !confirm(`Delete "${experiment.name}"? Its results are lost.`)) return;
        setBusyId(experiment.id);
        const result = await experimentsApi.remove(selectedDomainId, experiment.id);
        if (result.error) {
            setMessage({ type: 'error', text: result.error });
        } else {
            setList(prev => prev.filter(e => e.id !== experiment.id));
            if (openId === experiment.id) setOpenId(null);
        }
        setBusyId(null);
    };

    const showResults = async (experiment: Experiment) => {
        if (!selectedDomainId) return;
        if (openId === experiment.id) {
            setOpenId(null);
            return;
        }
        setOpenId(experiment.id);
        setResults(null);
        setResultsLoading(true);
        const result = await experimentsApi.results(selectedDomainId, experiment.id);
        if (result.error) setMessage({ type: 'error', text: result.error });
        setResults(result.data || null);
        setResultsLoading(false);
    };

    if (!subLoading && !enabled) {
        return (
            <div className="page-stack">
                <PageHeader title="Experiments" subtitle="A/B test changes to your site and see which version wins." />
                <UpgradeGate feature="experiments" requiredPlan="pro"
                    message="Show visitors different versions of a page, count who reaches your goal, and get told when one version clearly wins. Upgrade to Pro to unlock experiments." />
            </div>
        );
    }

    const app = isApp(selectedDomain);
    const opened = list.find(e => e.id === openId) || null;
    const sample = list[0];
    const sampleKey = sample?.key || 'new-headline';
    const sampleVariant = sample?.variants[1]?.id || 'b';
    const sampleGoal = sample?.goal_event || 'signup';

    return (
        <div className="page-stack">
            <PageHeader
                title="Experiments"
                subtitle={<>A/B tests on <strong style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{selectedDomain?.domain || 'your site'}</strong>. Results are checked every day.</>}
                actions={editing === null && (
                    <button type="button" className="btn btn-primary" onClick={() => openForm('new')}>
                        <Plus size={16} /> New test
                    </button>
                )}
            />

            {message && (
                <p role={message.type === 'error' ? 'alert' : 'status'} style={{
                    margin: 0, fontSize: '0.8125rem',
                    color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
                }}>
                    {message.text}
                </p>
            )}

            {editing !== null && (
                <ChartCard
                    title={editing === 'new' ? 'New test' : `Edit “${editing.name}”`}
                    subtitle="Each visitor always sees the same version."
                >
                    <form onSubmit={handleSave}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                            <div style={{ flex: '2 1 240px', minWidth: 0 }}>
                                <label style={labelStyle} htmlFor="exp-name">Name</label>
                                <input id="exp-name" className="input" value={name} onChange={e => setName(e.target.value)}
                                    placeholder="New pricing headline" required />
                            </div>
                            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                                <label style={labelStyle} htmlFor="exp-key">Key <span style={optionalStyle}>(used in your code)</span></label>
                                <input id="exp-key" className="input" value={key} onChange={e => setKey(e.target.value.toLowerCase())}
                                    placeholder="Made from the name" pattern="[a-z0-9][a-z0-9\-]{0,79}"
                                    title="Lowercase letters, numbers and dashes" />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                            <div style={{ flex: '2 1 240px', minWidth: 0 }}>
                                <label style={labelStyle} htmlFor="exp-goal">Goal event</label>
                                <input id="exp-goal" className="input" value={goal} onChange={e => setGoal(e.target.value)}
                                    placeholder="signup" />
                                <p style={helpStyle}>The custom event that counts as a conversion, sent with <code>TF(&apos;track&apos;, &apos;signup&apos;)</code>.</p>
                            </div>
                            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                                <label style={labelStyle} htmlFor="exp-traffic">Visitors in the test</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <input id="exp-traffic" className="input" type="number" min={1} max={100} value={traffic}
                                        onChange={e => setTraffic(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
                                    <span className="muted">%</span>
                                </div>
                                <p style={helpStyle}>The rest see the original and are not counted.</p>
                            </div>
                        </div>

                        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
                            <legend style={labelStyle}>Versions</legend>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {variants.map((variant, index) => (
                                    <div key={variant.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <code style={{ width: 28, textAlign: 'center' }} title="Version id your code receives">{variant.id}</code>
                                        <input className="input" aria-label={`Version ${variant.id} name`} style={{ flex: '1 1 160px', minWidth: 0 }}
                                            value={variant.name} onChange={e => setVariant(index, { name: e.target.value })}
                                            placeholder={index === 0 ? 'Original' : `Version ${variant.id.toUpperCase()}`} />
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input className="input" type="number" min={0} max={100} aria-label={`Version ${variant.id} share`}
                                                style={{ width: 80 }} value={variant.weight}
                                                onChange={e => setVariant(index, { weight: Number(e.target.value) })} />
                                            <span className="muted">%</span>
                                        </div>
                                        <button type="button" className="btn btn-ghost" aria-label={`Remove version ${variant.id}`}
                                            disabled={variants.length <= 2 || index === 0}
                                            onClick={() => setVariants(prev => prev.filter((_, i) => i !== index))}>
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                                {variants.length < 6 && (
                                    <button type="button" className="btn btn-secondary" onClick={addVariant}>
                                        <Plus size={16} /> Add version
                                    </button>
                                )}
                                <span style={{ fontSize: '0.8125rem', color: totalWeight === 100 ? 'var(--color-text-secondary)' : 'var(--color-warning)' }}>
                                    {totalWeight === 100 ? 'Shares add up to 100%.' : `Shares add up to ${totalWeight}%. They are scaled to 100%.`}
                                </span>
                            </div>
                            <p style={helpStyle}>The first version is the original. The others are compared with it.</p>
                        </fieldset>

                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="submit" className="btn btn-primary" disabled={saving || !name.trim() || totalWeight <= 0}>
                                {saving ? 'Saving…' : editing === 'new' ? 'Add test' : 'Save'}
                            </button>
                            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                    </form>
                </ChartCard>
            )}

            <ChartCard flush title="Tests" subtitle={loading ? undefined : `${list.length} ${list.length === 1 ? 'test' : 'tests'}`}>
                {loading ? (
                    <div className="skeleton" style={{ height: 120, margin: '0 20px 20px' }} />
                ) : list.length === 0 ? (
                    <div className="empty-note">No tests yet. Add one, put the code below on your site, then start it.</div>
                ) : (
                    <div style={{ overflowX: 'auto', marginTop: 6 }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ paddingLeft: 20 }}>Test</th>
                                    <th>Status</th>
                                    <th>Goal</th>
                                    <th>Latest result</th>
                                    <th aria-label="Actions" style={{ paddingRight: 20 }} />
                                </tr>
                            </thead>
                            <tbody>
                                {list.map(experiment => {
                                    const badge = STATUS_BADGE[experiment.status];
                                    const busy = busyId === experiment.id;
                                    const stored = experiment.result;
                                    return (
                                        <tr key={experiment.id}>
                                            <td style={{ paddingLeft: 20 }}>
                                                <div style={{ fontWeight: 500 }}>{experiment.name}</div>
                                                <div className="muted" style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                                                    {experiment.key} · {experiment.variants.length} versions · {experiment.traffic_allocation}% of visitors
                                                </div>
                                            </td>
                                            <td><span className={badge.className}>{badge.label}</span></td>
                                            <td>{experiment.goal_event ? <code>{experiment.goal_event}</code> : <span className="muted">Not set</span>}</td>
                                            <td style={{ fontSize: '0.8125rem' }}>
                                                {stored?.status === 'winner' && stored.winner
                                                    ? <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>
                                                        {experiment.variants.find(v => v.id === stored.winner)?.name || stored.winner} wins
                                                    </span>
                                                    : stored ? <span className="muted">{stored.status === 'no_difference' ? 'No real difference' : stored.status === 'too_early' ? 'Too early' : 'No data'}</span>
                                                        : <span className="muted">—</span>}
                                            </td>
                                            <td style={{ paddingRight: 20, whiteSpace: 'nowrap', textAlign: 'right' }}>
                                                <button type="button" className="btn btn-ghost" onClick={() => showResults(experiment)}
                                                    aria-expanded={openId === experiment.id} title="Results">
                                                    <BarChart3 size={16} /> Results
                                                </button>
                                                {experiment.status === 'draft' && (
                                                    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => handleStatus(experiment, 'active')}>
                                                        <Play size={16} /> Start
                                                    </button>
                                                )}
                                                {experiment.status === 'active' && (
                                                    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => handleStatus(experiment, 'ended')}>
                                                        <Square size={16} /> End
                                                    </button>
                                                )}
                                                {experiment.status !== 'ended' && (
                                                    <button type="button" className="btn btn-ghost" aria-label={`Edit ${experiment.name}`} onClick={() => openForm(experiment)}>
                                                        <Pencil size={16} />
                                                    </button>
                                                )}
                                                <button type="button" className="btn btn-ghost" aria-label={`Delete ${experiment.name}`} disabled={busy}
                                                    onClick={() => handleRemove(experiment)}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </ChartCard>

            {opened && (
                <ChartCard
                    flush
                    title={`Results: ${opened.name}`}
                    subtitle={opened.goal_event ? <>Visitors who sent <code>{opened.goal_event}</code> after seeing the test</> : 'Set a goal event to count conversions'}
                    loading={resultsLoading}
                >
                    {results && <ResultsView experiment={opened} results={results} />}
                </ChartCard>
            )}

            {app ? (
                <ChartCard title="Add a test to your app">
                    <p style={{ ...helpStyle, marginTop: 0 }}>
                        Needs <code>@thravic/react-native</code> 0.2 or later. Ask for the user&apos;s version on the screen that changes. It gives the version id, or <code>null</code> when the user is not in the test or it is not running. Then send the goal when a user converts.
                    </p>
                    <pre style={codeStyle}>{`import { Thravic, useVariant } from '@thravic/react-native';

function Paywall() {
  const version = useVariant('${sampleKey}');  // undefined while loading
  if (version === undefined) return null;
  return version === '${sampleVariant}' ? <NewPaywall /> : <OldPaywall />;
}

// when the user reaches the goal
Thravic.track('${sampleGoal}');`}</pre>
                    <p style={helpStyle}>Outside React, <code>await Thravic.variant(&apos;{sampleKey}&apos;)</code> gives the same answer. If the test cannot load in 3 seconds, the answer is <code>null</code>.</p>
                </ChartCard>
            ) : (
                <ChartCard title="Add a test to your site">
                    <p style={{ ...helpStyle, marginTop: 0 }}>
                        Ask for the visitor&apos;s version where the page shows the change. It returns the version id, or <code>null</code> when the visitor is not in the test or it is not running. Then send the goal when a visitor converts.
                    </p>
                    <pre style={codeStyle}>{`TF('variant', '${sampleKey}', function (version) {
  if (version === '${sampleVariant}') {
    // show the new version
  }
});

// when the visitor reaches the goal
TF('track', '${sampleGoal}');`}</pre>
                    <p style={helpStyle}>Hide the changing part until the callback runs so visitors do not see it flicker. If the test cannot load in 3 seconds, the callback gets <code>null</code>.</p>
                </ChartCard>
            )}
        </div>
    );
}

function ResultsView({ experiment, results }: { experiment: Experiment; results: ExperimentResult }) {
    const winnerName = results.winner ? results.variants.find(v => v.id === results.winner)?.name || results.winner : null;
    return (
        <div>
            <div style={{ padding: '4px 20px 12px', fontSize: '0.875rem', lineHeight: 1.55 }}>
                <strong style={{ color: results.status === 'winner' ? 'var(--color-success)' : 'var(--color-text-primary)' }}>
                    {results.status === 'winner' && winnerName ? `${winnerName} wins.` : VERDICT_TEXT[results.status]}
                </strong>
                {' '}
                <span className="muted">
                    {results.totalVisitors.toLocaleString()} visitors, {results.totalConversions.toLocaleString()} conversions.
                    {results.status === 'too_early' && results.visitorsNeeded
                        ? ` About ${results.visitorsNeeded.toLocaleString()} more visitors are needed to spot a 10% difference.`
                        : ''}
                </span>
            </div>
            {!results.splitOk && (
                <div role="alert" style={{ margin: '0 20px 12px', padding: '8px 12px', borderRadius: 8, fontSize: '0.8125rem', background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
                    Visitors are not split the way the shares ask. Something may be stopping one version from loading, so do not trust these results until it is fixed.
                </div>
            )}
            <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th style={{ paddingLeft: 20 }}>Version</th>
                            <th className="num">Visitors</th>
                            <th className="num">Conversions</th>
                            <th className="num">Rate</th>
                            <th className="num">Change vs original</th>
                            <th className="num" style={{ paddingRight: 20 }}>Chance to be best</th>
                        </tr>
                    </thead>
                    <tbody>
                        {results.variants.map((variant, index) => (
                            <tr key={variant.id}>
                                <td style={{ paddingLeft: 20 }}>
                                    <span style={{ fontWeight: 500 }}>{variant.name}</span>
                                    {index === 0 && <span className="muted"> (original)</span>}
                                    {variant.id === results.winner && <span className="badge badge-success" style={{ marginLeft: 6 }}>Winner</span>}
                                </td>
                                <td className="num">{variant.visitors.toLocaleString()}</td>
                                <td className="num">{variant.conversions.toLocaleString()}</td>
                                <td className="num">{pct(variant.rate, 2)}</td>
                                <td className="num">
                                    {variant.lift === null ? <span className="muted">—</span> : (
                                        <>
                                            <span style={{ color: variant.lift > 0 ? 'var(--color-success)' : variant.lift < 0 ? 'var(--color-error)' : undefined }}>
                                                {signedPct(variant.lift)}
                                            </span>
                                            <div className="muted" style={{ fontSize: '0.75rem' }}>
                                                likely {signedPct(variant.liftLow)} to {signedPct(variant.liftHigh)}
                                            </div>
                                        </>
                                    )}
                                </td>
                                <td className="num" style={{ paddingRight: 20 }}>{pct(variant.chanceBest, 0)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="muted" style={{ fontSize: '0.75rem', padding: '10px 20px 16px', margin: 0 }}>
                A winner is called when one version has at least a 95% chance to be best, once every version has 100+ visitors and the test has 20+ conversions in all.
            </p>
        </div>
    );
}

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.8125rem', fontWeight: 500,
    color: 'var(--color-text-secondary)', marginBottom: '4px',
};

const optionalStyle: React.CSSProperties = { color: 'var(--color-text-muted)', fontWeight: 400 };

const helpStyle: React.CSSProperties = {
    fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '6px 0 0', lineHeight: 1.5,
};

const codeStyle: React.CSSProperties = {
    margin: '10px 0 0', padding: '12px 14px', borderRadius: 8, overflowX: 'auto',
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
    fontFamily: 'var(--font-mono)', fontSize: '0.75rem', lineHeight: 1.6,
};
