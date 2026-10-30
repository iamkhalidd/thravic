'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useDomain } from '@/contexts/DomainContext';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';
import { SplitBar } from '@/components/charts/SplitBar';
import { inEvery } from '@/components/charts/format';
import { domains, feedback as feedbackApi, type DomainSettings, type FeedbackSummary } from '@/lib/api';

const DAY_CHOICES = [7, 30, 90] as const;
const QUESTION_MAX = 120;

function dateTime(iso: string): string {
    return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function FeedbackPage() {
    const { selectedDomainId, selectedDomain, loading: domainLoading } = useDomain();
    const [days, setDays] = useState<number>(30);
    const [data, setData] = useState<FeedbackSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [settings, setSettings] = useState<DomainSettings | null>(null);
    const [question, setQuestion] = useState('');
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (!selectedDomainId) return;
        setSettings(null);
        domains.get(selectedDomainId).then(({ data, error }) => {
            if (data) {
                setSettings(data.settings);
                setQuestion(data.settings.feedbackQuestion);
            }
            if (error) setNotice({ type: 'error', text: error });
        });
    }, [selectedDomainId]);

    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainLoading) setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        feedbackApi.get(selectedDomainId, days).then(({ data, error }) => {
            if (cancelled) return;
            setData(data ?? null);
            setError(data ? null : error || 'Could not load feedback');
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [selectedDomainId, domainLoading, days]);

    const save = async (changes: Partial<DomainSettings>, done: string) => {
        if (!selectedDomainId || !settings) return;
        setSaving(true);
        setNotice(null);
        const { data, error } = await domains.updateSettings(selectedDomainId, changes);
        if (data) {
            setSettings(data.settings);
            setQuestion(data.settings.feedbackQuestion);
            setNotice({ type: 'success', text: done });
        } else {
            setNotice({ type: 'error', text: error || 'Could not save' });
        }
        setSaving(false);
    };

    const on = !!settings?.feedbackWidget;
    const total = (data?.yes ?? 0) + (data?.no ?? 0);
    const trimmed = question.trim();
    const questionChanged = !!settings && trimmed !== settings.feedbackQuestion;

    return (
        <div className="page-stack">
            <PageHeader
                title="Feedback"
                subtitle={<>Ask visitors to <strong style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{selectedDomain?.domain || 'your site'}</strong> one quick question, and see what they say.</>}
                actions={
                    <select className="input" aria-label="Period" value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: 'auto' }}>
                        {DAY_CHOICES.map(n => <option key={n} value={n}>Last {n} days</option>)}
                    </select>
                }
            />

            <ChartCard title="Feedback widget" subtitle="A small box in the bottom corner, shown once a month per visitor after 30 seconds or when they scroll most of a page.">
                {!settings ? (
                    <div className="skeleton" style={{ height: 90 }} />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <label htmlFor="feedback-switch" style={{ flex: 1, fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer' }}>
                                Show the widget to visitors
                            </label>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }} aria-hidden="true">{on ? 'On' : 'Off'}</span>
                            <button
                                id="feedback-switch"
                                type="button"
                                role="switch"
                                aria-checked={on}
                                disabled={saving}
                                onClick={() => save({ feedbackWidget: !on }, on ? 'Widget switched off' : 'Widget switched on. Visitors see it within about a minute.')}
                                style={{
                                    width: 40, height: 22, flexShrink: 0, borderRadius: 11, border: '1px solid var(--color-border)',
                                    background: on ? 'var(--color-text-primary)' : 'var(--color-bg-tertiary)',
                                    position: 'relative', cursor: 'pointer', transition: 'background 150ms ease',
                                }}
                            >
                                <span style={{
                                    position: 'absolute', top: 2, left: on ? 20 : 2, width: 16, height: 16, borderRadius: '50%',
                                    background: on ? 'var(--color-bg-primary)' : 'var(--color-text-muted)', transition: 'left 150ms ease',
                                }} />
                            </button>
                        </div>

                        <form
                            onSubmit={e => { e.preventDefault(); if (trimmed) save({ feedbackQuestion: trimmed }, 'Question saved'); }}
                            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
                        >
                            <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                                <label htmlFor="feedback-question" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                                    Question
                                </label>
                                <input
                                    id="feedback-question"
                                    className="input"
                                    maxLength={QUESTION_MAX}
                                    value={question}
                                    onChange={e => setQuestion(e.target.value)}
                                />
                            </div>
                            <button type="submit" className="btn btn-secondary" disabled={saving || !trimmed || !questionChanged}>
                                Save question
                            </button>
                        </form>

                        {notice && (
                            <p role={notice.type === 'error' ? 'alert' : 'status'} style={{ margin: 0, fontSize: '0.8125rem', color: notice.type === 'success' ? 'var(--color-success)' : 'var(--color-error)' }}>
                                {notice.text}
                            </p>
                        )}
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                            Visitors answer Yes or No, then can add a comment. Answers also go to any webhook or Slack channel subscribed to feedback.
                        </p>
                    </div>
                )}
            </ChartCard>

            {error ? (
                <div role="alert" className="card" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</div>
            ) : (
                <>
                    <ChartCard
                        title="Was this page helpful?"
                        subtitle="Every answer in this period"
                        info="Visitors answer yes or no in the feedback widget at the bottom of your pages."
                        loading={loading}
                        height={120}
                        summary={total > 0
                            ? <><strong>{inEvery((data?.yes ?? 0) / total).replace(/^./, c => c.toUpperCase())}</strong> said yes ({total.toLocaleString()} {total === 1 ? 'answer' : 'answers'}).</>
                            : undefined}
                    >
                        <SplitBar
                            emptyText={on ? 'No answers in this period yet.' : 'Switch the widget on to start collecting answers.'}
                            parts={[
                                { label: 'Yes', value: data?.yes ?? 0, icon: <ThumbsUp size={12} aria-hidden="true" /> },
                                { label: 'No', value: data?.no ?? 0, icon: <ThumbsDown size={12} aria-hidden="true" />, negative: true },
                            ]}
                        />
                    </ChartCard>

                    <ChartCard flush title="By page" subtitle="Pages with the most answers.">
                        {loading ? (
                            <div className="skeleton" style={{ height: 140, margin: '0 20px 20px' }} />
                        ) : !data || data.pages.length === 0 ? (
                            <div className="empty-note">No answers in this period yet.</div>
                        ) : (
                            <div style={{ overflowX: 'auto', marginTop: 6 }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th style={{ paddingLeft: 20 }}>Page</th>
                                            <th className="num">Yes</th>
                                            <th className="num">No</th>
                                            <th className="num" style={{ paddingRight: 20 }}>Said yes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.pages.map(page => (
                                            <tr key={page.path}>
                                                <td style={{ paddingLeft: 20, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', wordBreak: 'break-all' }}>{page.path}</td>
                                                <td className="num">{page.yes}</td>
                                                <td className="num">{page.no}</td>
                                                <td className="num" style={{ paddingRight: 20 }}>{page.percentYes}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </ChartCard>

                    <ChartCard flush title="Latest answers">
                        {loading ? (
                            <div className="skeleton" style={{ height: 140, margin: '0 20px 20px' }} />
                        ) : !data || data.answers.length === 0 ? (
                            <div className="empty-note">{on ? 'No answers yet.' : 'Switch the widget on to start collecting answers.'}</div>
                        ) : (
                            <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
                                {data.answers.map(item => (
                                    <li key={item.id} style={{ display: 'flex', gap: 10, padding: '10px 20px', borderTop: '1px solid var(--color-border)' }}>
                                        {item.answer === 'yes'
                                            ? <ThumbsUp size={14} aria-label="Yes" style={{ color: 'var(--color-success)', marginTop: 3, flexShrink: 0 }} />
                                            : <ThumbsDown size={14} aria-label="No" style={{ color: 'var(--color-error)', marginTop: 3, flexShrink: 0 }} />}
                                        <div style={{ flex: 1, minWidth: 0, fontSize: '0.8125rem' }}>
                                            <div style={{ fontWeight: item.comment ? 500 : 400, color: item.comment ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', wordBreak: 'break-word' }}>
                                                {item.comment || (item.answer === 'yes' ? 'Yes, no comment' : 'No, no comment')}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                                                <span style={{ fontFamily: 'var(--font-mono)' }}>{item.path}</span>
                                                {' · '}{dateTime(item.at)}
                                                {item.visitorId && <> · <Link href={`/dashboard/visitors?visitor=${item.visitorId}`}>View visitor</Link></>}
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </ChartCard>
                </>
            )}
        </div>
    );
}
