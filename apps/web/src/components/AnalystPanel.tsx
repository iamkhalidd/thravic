'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Bug, MousePointerClick, PlayCircle, Search, Timer } from 'lucide-react';
import { analyst } from '@/lib/api';
import type { AnalystAnswer, AnalystOptions, AnalystRequest, AssistantUsage } from '@/lib/api';
import { useDateRange } from '@/contexts/DateRangeContext';
import { ChartCard } from '@/components/ChartCard';

/**
 * The AI analyst: why one metric changed, with the parts of the site behind it,
 * evidence, recordings and fixes. Ask in words or pick a metric.
 *
 * Opens on its own from a link: `/dashboard/insights?explain=<metric>&event=&start=&end=`
 * (the "Explain this" buttons) or `?ask=<question>`.
 */
export const ANALYST_ANCHOR = 'why';

const EVIDENCE_ICON = { error: Bug, rage_click: MousePointerClick, slow_page: Timer } as const;

function fmtValue(value: number | null, isRate: boolean) {
    if (value === null || value === undefined) return '–';
    return isRate ? `${value}%` : value.toLocaleString();
}

function fmtDelta(value: number | null, isRate: boolean) {
    if (value === null || value === undefined) return '–';
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return `${sign}${Math.abs(value).toLocaleString()}${isRate ? ' pts' : ''}`;
}

function fmtDay(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function AnalystPanel({ domainId }: { domainId: string }) {
    const { startDate, endDate } = useDateRange();
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState<AnalystOptions | null>(null);
    const [usage, setUsage] = useState<AssistantUsage | null>(null);
    const [metric, setMetric] = useState('visitors');
    const [event, setEvent] = useState('');
    const [picker, setPicker] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [answer, setAnswer] = useState<AnalystAnswer | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const autoRan = useRef(false);

    useEffect(() => {
        let live = true;
        analyst.options(domainId).then(res => {
            if (!live || !res.data) return;
            setOptions({ metrics: res.data.metrics, events: res.data.events });
            setUsage(res.data.usage);
            if (res.data.events[0]) setEvent(e => e || res.data!.events[0]);
        });
        return () => { live = false; };
    }, [domainId]);

    const run = useCallback(async (body: AnalystRequest) => {
        setBusy(true);
        setError(null);
        const res = await analyst.explain(domainId, {
            ...body,
            context: {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                tzOffset: new Date().getTimezoneOffset(),
            },
        });
        setBusy(false);
        if (!res.data) {
            setError(res.error ?? 'Could not explain that just now.');
            return;
        }
        if (res.data.status === 'choose') {
            // The question didn't say which number: let the reader pick it.
            setOptions({ metrics: res.data.metrics, events: res.data.events });
            setPicker(true);
            setAnswer(null);
            return;
        }
        setAnswer(res.data);
        setUsage(res.data.usage);
        setMetric(res.data.metric);
        if (res.data.event) setEvent(res.data.event);
    }, [domainId, startDate, endDate]);

    // "Explain this" links land here with what to explain in the URL.
    useEffect(() => {
        if (autoRan.current) return;
        const params = new URLSearchParams(window.location.search);
        const ask = params.get('ask');
        const explain = params.get('explain');
        if (!ask && !explain) return;
        autoRan.current = true;
        ref.current?.scrollIntoView({ block: 'start' });
        if (ask) {
            setQuestion(ask);
            run({ question: ask });
        } else if (explain) {
            setMetric(explain);
            if (params.get('event')) setEvent(params.get('event')!);
            run({
                metric: explain,
                event: params.get('event') ?? undefined,
                start: params.get('start') ?? undefined,
                end: params.get('end') ?? undefined,
            });
        }
    }, [run]);

    const submitQuestion = (e: React.FormEvent) => {
        e.preventDefault();
        if (question.trim()) run({ question: question.trim() });
    };

    const isRate = answer?.isRate ?? false;
    const noQuestionsLeft = usage !== null && usage.left <= 0;

    return (
        <div ref={ref} id={ANALYST_ANCHOR} style={{ scrollMarginTop: 16 }}>
            <ChartCard
                title="Why did it change?"
                subtitle="Ask about a drop or a jump, and see which pages, sources, devices or countries are behind it"
                action={usage ? (
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {usage.left} question{usage.left === 1 ? '' : 's'} left today
                    </span>
                ) : undefined}
            >
                <form onSubmit={submitQuestion} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                        className="input"
                        value={question}
                        onChange={e => setQuestion(e.target.value)}
                        placeholder="e.g. Why did sign-ups drop last week?"
                        aria-label="Your question"
                        maxLength={500}
                        style={{ flex: '1 1 260px', minWidth: 0 }}
                    />
                    <button type="submit" className="btn btn-primary" disabled={busy || !question.trim() || noQuestionsLeft}>
                        <Search size={16} aria-hidden="true" />
                        {busy ? 'Looking…' : 'Explain'}
                    </button>
                </form>

                <div style={{ marginTop: 10, fontSize: '0.8125rem' }}>
                    {!picker ? (
                        <button type="button" onClick={() => setPicker(true)} style={linkButton}>
                            Or pick a number to explain
                        </button>
                    ) : options && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            {answer === null && !busy && question && (
                                <span style={{ color: 'var(--color-text-secondary)', flexBasis: '100%' }}>
                                    Which number do you mean?
                                </span>
                            )}
                            <select className="input" value={metric} onChange={e => setMetric(e.target.value)}
                                aria-label="Number to explain" style={{ width: 'auto' }}>
                                {options.metrics.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                {options.events.length > 0 && <option value="event">A custom event</option>}
                            </select>
                            {metric === 'event' && (
                                <select className="input" value={event} onChange={e => setEvent(e.target.value)}
                                    aria-label="Event" style={{ width: 'auto' }}>
                                    {options.events.map(name => <option key={name} value={name}>{name}</option>)}
                                </select>
                            )}
                            <button type="button" className="btn btn-secondary"
                                disabled={busy || noQuestionsLeft || (metric === 'event' && !event)}
                                onClick={() => run({ metric, event: metric === 'event' ? event : undefined })}>
                                Explain for this date range
                            </button>
                        </div>
                    )}
                </div>

                {error && (
                    <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem', margin: '12px 0 0' }}>{error}</p>
                )}
                {busy && <div className="skeleton" style={{ height: 120, marginTop: 16 }} aria-busy="true" />}

                {answer && !busy && (
                    <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 12px' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                {answer.metricLabel} · {fmtDay(answer.period.current.start)} – {fmtDay(answer.period.current.end)} against {fmtDay(answer.period.previous.start)} – {fmtDay(answer.period.previous.end)}
                            </span>
                            <span className="badge" title={answer.aiGenerated ? 'Written by AI from your numbers' : 'Written by rules from the same numbers'}>
                                {answer.aiGenerated ? 'AI' : 'Rule-based'}
                            </span>
                        </div>

                        {answer.status === 'no_data' ? (
                            <p className="empty-note" style={{ margin: 0 }}>{answer.cause}</p>
                        ) : (
                            <>
                                <div>
                                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9375rem' }}>{answer.cause}</p>
                                    {answer.explanation && (
                                        <p style={{ margin: '6px 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                            {answer.explanation}
                                        </p>
                                    )}
                                    <p style={{ margin: '8px 0 0', fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>Whole site:</span>{' '}
                                        {fmtValue(answer.headline.before, isRate)} → {fmtValue(answer.headline.now, isRate)}{' '}
                                        ({fmtDelta(answer.headline.delta, isRate)}
                                        {answer.headline.changePct !== null ? `, ${answer.headline.changePct > 0 ? '+' : ''}${answer.headline.changePct}%` : ''})
                                    </p>
                                </div>

                                {answer.fixes.length > 0 && (
                                    <div style={{
                                        padding: '8px 12px', background: 'var(--color-bg-tertiary)',
                                        borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--color-accent-primary)',
                                    }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>What to try</span>
                                        <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: '0.8125rem' }}>
                                            {answer.fixes.map(fix => <li key={fix}>{fix}</li>)}
                                        </ul>
                                    </div>
                                )}

                                {answer.segments.length > 0 && (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th>Behind the change</th>
                                                    <th className="num">Before</th>
                                                    <th className="num">Now</th>
                                                    <th className="num">Change</th>
                                                    <th className="num">Share of change</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {answer.segments.map(seg => (
                                                    <tr key={`${seg.dimension}|${seg.key}`}>
                                                        <td>
                                                            <span style={{ color: 'var(--color-text-muted)' }}>{seg.dimension}: </span>
                                                            <Link href={seg.link}>{seg.key}</Link>
                                                        </td>
                                                        <td className="num">{fmtValue(seg.before, isRate)}</td>
                                                        <td className="num">{fmtValue(seg.now, isRate)}</td>
                                                        <td className="num">{fmtDelta(seg.delta, isRate)}</td>
                                                        <td className="num">{seg.shareOfChangePct !== null ? `${seg.shareOfChangePct}%` : '–'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {answer.evidence.length > 0 && (
                                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {answer.evidence.map(item => {
                                            const Icon = EVIDENCE_ICON[item.kind] ?? Bug;
                                            return (
                                                <li key={item.subject} style={{ display: 'flex', gap: 10, fontSize: '0.8125rem' }}>
                                                    <Icon size={15} aria-hidden="true" style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 2 }} />
                                                    <span style={{ minWidth: 0 }}>
                                                        <Link href={item.link}>{item.subject}</Link>
                                                        {item.scope && <span style={{ color: 'var(--color-text-muted)' }}> ({item.scope})</span>}
                                                        <EvidenceNumbers numbers={item.numbers} />
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}

                                {answer.recordings.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: '0.8125rem' }}>
                                        {answer.recordings.map((id, i) => (
                                            <Link key={id} href={`/dashboard/sessions?recording=${id}`}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <PlayCircle size={14} aria-hidden="true" /> Watch visit {i + 1}
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </ChartCard>
        </div>
    );
}

const EVIDENCE_LABEL: Record<string, string> = {
    visitsAffected: 'visits affected',
    visitsAffectedBefore: 'before',
    lcpMs: 'load time (LCP)',
    lcpBeforeMs: 'before',
    samples: 'measurements',
    goodLcpMs: 'good is under',
};

function EvidenceNumbers({ numbers }: { numbers: Record<string, number | null> }) {
    const parts = Object.entries(numbers)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `${EVIDENCE_LABEL[k] ?? k}: ${k.endsWith('Ms') ? `${v} ms` : v!.toLocaleString()}`);
    if (!parts.length) return null;
    return <span style={{ display: 'block', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{parts.join(' · ')}</span>;
}

const linkButton: React.CSSProperties = {
    padding: 0, background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--color-text-secondary)', font: 'inherit', textDecoration: 'underline',
};

/** Where an "Explain this" button points. */
export function explainHref(metric: string, opts: { event?: string; start?: string; end?: string } = {}) {
    const params = new URLSearchParams({ explain: metric });
    if (opts.event) params.set('event', opts.event);
    if (opts.start) params.set('start', opts.start);
    if (opts.end) params.set('end', opts.end);
    return `/dashboard/insights?${params}#${ANALYST_ANCHOR}`;
}
