'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Sparkles, X, ArrowUp, ArrowRight, RotateCcw } from 'lucide-react';
import { useDomain } from '@/contexts/DomainContext';
import { useDateRange } from '@/contexts/DateRangeContext';
import { useSubscription } from '@/hooks/useSubscription';
import { isApp } from '@/lib/platform';
import { assistant, type AssistantMessage, type AssistantUsage } from '@/lib/api';

/** Ask a question from anywhere: `window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: 'question' }))`. */
export const ASK_EVENT = 'thravic:ask';

interface ChatMessage extends AssistantMessage {
    links?: Array<{ label: string; href: string }>;
    failed?: boolean;
}

interface PageHelp { title: string; suggestions: string[] }

const GENERAL: string[] = [
    'How is my site doing today?',
    'Why did my traffic change this week?',
    'What am I tracking?',
];

// The page the user is on, and questions that make sense there. Longest match wins.
const PAGES: Record<string, PageHelp> = {
    '/dashboard': { title: 'Overview', suggestions: ['How is my site doing today?', 'Am I growing compared with last week?', 'What should I look at first?'] },
    '/dashboard/insights': { title: 'AI insights', suggestions: ['What changed most this week?', 'What is the most important thing to fix?', 'Explain my insights simply'] },
    '/dashboard/reports': { title: 'Reports', suggestions: ['Summarise last month for me', 'How did this month compare with last month?'] },
    '/dashboard/traffic/sources': { title: 'Sources', suggestions: ['Where do most of my visitors come from?', 'Which source grew most this week?', 'Is search traffic going up?'] },
    '/dashboard/traffic/campaigns': { title: 'Campaigns', suggestions: ['Which campaign brought the most visits?', 'Did my campaigns bring more visits than last week?'] },
    '/dashboard/traffic/trends': { title: 'Trends', suggestions: ['What was my best day this month?', 'When do people visit most?', 'Is my traffic going up or down?'] },
    '/dashboard/behavior/pages': { title: 'Pages', suggestions: ['Which pages are viewed most?', 'Which landing page loses the most visitors?', 'Where do people leave my site?'] },
    '/dashboard/behavior/paths': { title: 'Page flow', suggestions: ['Where do people go after the home page?', 'Which pages do people leave from?'] },
    '/dashboard/funnels': { title: 'Funnels', suggestions: ['Where do people drop out of my funnel?', 'Is my funnel doing better than last week?'] },
    '/dashboard/behavior/devices': { title: 'Devices', suggestions: ['Do more people use phones or computers?', 'Which device grew most this week?'] },
    '/dashboard/behavior/versions': { title: 'App versions', suggestions: ['How many people are on the newest version?', 'How is my app doing this week?'] },
    '/dashboard/sessions': { title: 'Session recordings', suggestions: ['Is session recording switched on?', 'Which pages should I watch recordings of?'] },
    '/dashboard/heatmaps': { title: 'Heatmaps', suggestions: ['Which pages get the most views to study?', 'Is click tracking on?'] },
    '/dashboard/rage-clicks': { title: 'Rage clicks', suggestions: ['Where are people rage clicking?', 'Is it worse than last week?'] },
    '/dashboard/forms': { title: 'Forms', suggestions: ['Is form tracking switched on?', 'Which pages do people leave from most?'] },
    '/dashboard/errors': { title: 'Errors', suggestions: ['What errors are my visitors hitting?', 'Are errors going up?', 'Which page has the most errors?'] },
    '/dashboard/performance': { title: 'Page speed', suggestions: ['Which pages are slow?', 'Is my site getting faster or slower?'] },
    '/dashboard/tracking': { title: 'Site settings', suggestions: ['What am I tracking?', 'Is data still coming in?', 'When was my last visit?'] },
};

function pageHelp(pathname: string): PageHelp {
    const match = Object.keys(PAGES)
        .filter(path => pathname === path || (path !== '/dashboard' && pathname.startsWith(path + '/')))
        .sort((a, b) => b.length - a.length)[0];
    return match ? PAGES[match] : { title: 'Dashboard', suggestions: GENERAL };
}

const STORAGE_PREFIX = 'thravic_ask_';
const MAX_KEPT = 30;

function loadChat(domainId: string): ChatMessage[] {
    try {
        const raw = sessionStorage.getItem(STORAGE_PREFIX + domainId);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveChat(domainId: string, messages: ChatMessage[]) {
    try {
        sessionStorage.setItem(STORAGE_PREFIX + domainId, JSON.stringify(messages.slice(-MAX_KEPT)));
    } catch {
        // Storage full or blocked: the chat just isn't kept across reloads.
    }
}

/** **bold** and "- " list lines; everything else is plain text. */
function Answer({ text }: { text: string }) {
    const lines = text.split('\n').map(line => line.trimEnd()).filter((line, i, all) => line || (i > 0 && all[i - 1]));
    const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4
            ? <strong key={i} style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong>
            : <span key={i}>{part}</span>
    );
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lines.map((line, i) => {
                const bullet = /^\s*([-•*]|\d+\.)\s+/.exec(line);
                if (!line) return null;
                return bullet ? (
                    <div key={i} style={{ display: 'flex', gap: 8 }}>
                        <span aria-hidden="true" style={{ color: 'var(--color-text-muted)' }}>•</span>
                        <span>{inline(line.slice(bullet[0].length))}</span>
                    </div>
                ) : <p key={i} style={{ margin: 0 }}>{inline(line)}</p>;
            })}
        </div>
    );
}

export function AskThravic({ pathname }: { pathname: string }) {
    const { selectedDomainId, selectedDomain } = useDomain();
    const { startDate, endDate } = useDateRange();
    const { hasFeature, loading: planLoading } = useSubscription();

    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [usage, setUsage] = useState<AssistantUsage | null>(null);
    const [isNarrow, setIsNarrow] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const pendingRef = useRef<string | null>(null);

    const allowed = hasFeature('insights', selectedDomain?.features || undefined);
    const help = pageHelp(pathname);
    const app = isApp(selectedDomain);
    const suggestions = app
        ? help.suggestions.map(s => s.replace(/\bsite\b/g, 'app').replace(/\bpages?\b/g, m => m === 'page' ? 'screen' : 'screens'))
        : help.suggestions;

    useEffect(() => {
        const check = () => setIsNarrow(window.innerWidth < 640);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Each site has its own conversation, kept for this browser tab.
    useEffect(() => {
        setMessages(selectedDomainId ? loadChat(selectedDomainId) : []);
        setUsage(null);
    }, [selectedDomainId]);

    useEffect(() => {
        if (selectedDomainId) saveChat(selectedDomainId, messages);
    }, [messages, selectedDomainId]);

    useEffect(() => {
        if (!open || !allowed || !selectedDomainId || usage) return;
        assistant.usage(selectedDomainId).then(({ data }) => { if (data) setUsage(data); });
    }, [open, allowed, selectedDomainId, usage]);

    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 50);
    }, [open]);

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, busy]);

    const send = useCallback(async (raw: string) => {
        const question = raw.trim();
        if (!question || busy || !selectedDomainId) return;
        const history: AssistantMessage[] = messages
            .filter(m => !m.failed)
            .map(({ role, content }) => ({ role, content }));
        setMessages(prev => [...prev, { role: 'user', content: question }]);
        setInput('');
        setBusy(true);
        const { data, error } = await assistant.ask(selectedDomainId, question, history, {
            path: pathname,
            pageTitle: help.title,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            tzOffset: new Date().getTimezoneOffset(),
        });
        setBusy(false);
        if (data) {
            setMessages(prev => [...prev, { role: 'assistant', content: data.answer, links: data.links }]);
            setUsage(data.usage);
        } else {
            setMessages(prev => [...prev, { role: 'assistant', content: error || 'Something went wrong. Please try again.', failed: true }]);
        }
    }, [busy, selectedDomainId, messages, pathname, help.title, startDate, endDate]);

    // Shortcuts: Ctrl/Cmd+K anywhere, "/" when not typing; Escape closes.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen(o => !o);
            } else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                setOpen(true);
            } else if (e.key === 'Escape') {
                setOpen(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // "Ask about this" from other pages.
    useEffect(() => {
        const onAsk = (e: Event) => {
            const question = (e as CustomEvent<string>).detail;
            setOpen(true);
            if (typeof question === 'string' && question.trim()) pendingRef.current = question;
        };
        window.addEventListener(ASK_EVENT, onAsk);
        return () => window.removeEventListener(ASK_EVENT, onAsk);
    }, []);

    useEffect(() => {
        if (open && allowed && pendingRef.current && !busy) {
            const question = pendingRef.current;
            pendingRef.current = null;
            send(question);
        }
    }, [open, allowed, busy, send]);

    const outOfQuestions = usage !== null && usage.left <= 0;
    const canAsk = allowed && !busy && !outOfQuestions && !!selectedDomainId;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                aria-controls="ask-thravic"
                title="Ask Thravic (Ctrl+K)"
                style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '5px 10px',
                    background: open ? 'var(--color-bg-hover)' : 'var(--color-bg-primary)',
                    border: `1px solid ${open ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                    borderRadius: '6px', cursor: 'pointer',
                    fontSize: '0.8125rem', color: 'var(--color-text-primary)',
                    whiteSpace: 'nowrap',
                }}
            >
                <Sparkles size={13} aria-hidden="true" />
                <span>Ask{isNarrow ? '' : ' Thravic'}</span>
            </button>

            {open && (
                <aside
                    id="ask-thravic"
                    role="dialog"
                    aria-label="Ask Thravic"
                    style={{
                        position: 'fixed', top: 0, right: 0, bottom: 0,
                        width: isNarrow ? '100%' : 400,
                        background: 'var(--color-bg-card)',
                        borderLeft: isNarrow ? 'none' : '1px solid var(--color-border)',
                        boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.15))',
                        zIndex: 70, display: 'flex', flexDirection: 'column',
                    }}
                >
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px 0 16px', height: 52, flexShrink: 0,
                        borderBottom: '1px solid var(--color-border)',
                    }}>
                        <Sparkles size={16} aria-hidden="true" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Ask Thravic</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {selectedDomain?.name || selectedDomain?.domain || 'Your site'} · {help.title}
                            </div>
                        </div>
                        {messages.length > 0 && (
                            <button type="button" onClick={() => setMessages([])} title="New chat" aria-label="New chat" style={iconButton}>
                                <RotateCcw size={15} />
                            </button>
                        )}
                        <button type="button" onClick={() => setOpen(false)} title="Close (Esc)" aria-label="Close" style={iconButton}>
                            <X size={16} />
                        </button>
                    </div>

                    <div ref={listRef} aria-live="polite" style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {!planLoading && !allowed ? (
                            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
                                <p style={{ margin: '0 0 8px', color: 'var(--color-text-primary)', fontWeight: 500 }}>Ask anything about your {app ? 'app' : 'site'} in plain words.</p>
                                <p style={{ margin: '0 0 14px' }}>
                                    &ldquo;How many people visited today?&rdquo;, &ldquo;Why did traffic drop?&rdquo;, &ldquo;Which page loses the most visitors?&rdquo;.
                                    Ask Thravic comes with the Pro and Agency plans.
                                </p>
                                <Link href="/dashboard/settings" className="btn btn-primary" onClick={() => setOpen(false)}>See plans</Link>
                            </div>
                        ) : messages.length === 0 ? (
                            <div>
                                <p style={{ margin: '0 0 4px', fontSize: '0.875rem', fontWeight: 500 }}>Ask about your {app ? 'app' : 'site'} in your own words.</p>
                                <p style={{ margin: '0 0 14px', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                                    Answers come from your own data. Any language is fine.
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {suggestions.map(s => (
                                        <button key={s} type="button" onClick={() => send(s)} disabled={!canAsk} style={suggestionStyle}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : messages.map((m, i) => m.role === 'user' ? (
                            <div key={i} style={{
                                alignSelf: 'flex-end', maxWidth: '85%', padding: '8px 12px',
                                background: 'var(--color-bg-tertiary)', borderRadius: 12,
                                fontSize: '0.875rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                            }}>{m.content}</div>
                        ) : (
                            <div key={i} style={{
                                fontSize: '0.875rem', lineHeight: 1.55, overflowWrap: 'anywhere',
                                color: m.failed ? 'var(--color-error)' : 'var(--color-text-primary)',
                            }}>
                                <Answer text={m.content} />
                                {!!m.links?.length && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 8 }}>
                                        {m.links.map(link => (
                                            <Link key={link.href} href={link.href} onClick={() => isNarrow && setOpen(false)}
                                                style={{ fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                See {link.label} <ArrowRight size={13} aria-hidden="true" />
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                        {busy && (
                            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }} role="status">Looking at your data…</div>
                        )}
                    </div>

                    {allowed && (
                        <form
                            onSubmit={e => { e.preventDefault(); send(input); }}
                            style={{ padding: 12, borderTop: '1px solid var(--color-border)', flexShrink: 0 }}
                        >
                            <div style={{
                                display: 'flex', alignItems: 'flex-end', gap: 8, padding: '6px 6px 6px 12px',
                                border: '1px solid var(--color-border)', borderRadius: 10, background: 'var(--color-bg-primary)',
                            }}>
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
                                    }}
                                    placeholder={outOfQuestions ? 'No questions left today' : 'Ask a question…'}
                                    aria-label="Your question"
                                    rows={1}
                                    maxLength={2000}
                                    disabled={outOfQuestions}
                                    style={{
                                        flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent',
                                        color: 'var(--color-text-primary)', font: 'inherit', fontSize: '0.875rem',
                                        maxHeight: 120, padding: '5px 0', fieldSizing: 'content',
                                    } as React.CSSProperties}
                                />
                                <button type="submit" disabled={!canAsk || !input.trim()} aria-label="Send" title="Send" style={{
                                    ...iconButton, width: 30, height: 30, borderRadius: 8,
                                    background: canAsk && input.trim() ? 'var(--color-text-primary)' : 'var(--color-bg-tertiary)',
                                    color: canAsk && input.trim() ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
                                }}>
                                    <ArrowUp size={16} />
                                </button>
                            </div>
                            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                <span>AI answers can be wrong; check the page linked.</span>
                                {usage && <span style={{ whiteSpace: 'nowrap' }}>{usage.left} left today</span>}
                            </div>
                        </form>
                    )}
                </aside>
            )}
        </>
    );
}

const iconButton: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, padding: 0, flexShrink: 0,
    background: 'transparent', border: 'none', borderRadius: 6,
    color: 'var(--color-text-secondary)', cursor: 'pointer',
};

const suggestionStyle: React.CSSProperties = {
    textAlign: 'left', padding: '8px 12px',
    background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 8,
    fontSize: '0.8125rem', color: 'var(--color-text-primary)', cursor: 'pointer', font: 'inherit',
};
