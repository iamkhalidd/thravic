'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Mail, Send } from 'lucide-react';

const MAX_SUBJECT = 150;

export default function ProductUpdatesPage() {
    const [subscribers, setSubscribers] = useState<number | null>(null);
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState<'test' | 'all' | null>(null);
    const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        api.get<{ subscribers: number }>('/api/admin/product-updates')
            .then(data => setSubscribers(data.subscribers))
            .catch(() => setSubscribers(null));
    }, []);

    const ready = subject.trim().length > 0 && message.trim().length > 0;

    const send = async (test: boolean) => {
        if (!ready) return;
        if (!test && !confirm(`Send "${subject.trim()}" to ${subscribers ?? 'all'} subscribers? This can't be undone.`)) return;
        setSending(test ? 'test' : 'all');
        setNotice(null);
        try {
            const data = await api.post('/api/admin/product-updates', { subject, message, test });
            setNotice(test
                ? { ok: true, text: `Test sent to ${data.sentTo}.` }
                : { ok: true, text: `Sending to ${data.recipients} subscribers.` });
            if (!test) { setSubject(''); setMessage(''); }
        } catch (err: any) {
            setNotice({ ok: false, text: err.message || 'Sending failed.' });
        } finally {
            setSending(null);
        }
    };

    return (
        <div>
            <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
                    <Mail size={18} />
                    <span className="card-title" style={{ flex: 1 }}>Product update email</span>
                    <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                        {subscribers === null ? '' : `${subscribers.toLocaleString()} subscriber${subscribers === 1 ? '' : 's'}`}
                    </span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: 'var(--space-lg)' }}>
                    Goes to users who turned on Product updates in Settings → Notifications. Send a test to
                    yourself first; blank lines start a new paragraph.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                    <input
                        className="input"
                        placeholder="Subject"
                        maxLength={MAX_SUBJECT}
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                    />
                    <textarea
                        className="input"
                        rows={10}
                        placeholder="What's new..."
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        style={{ resize: 'vertical', fontFamily: 'inherit' }}
                    />
                    {notice && (
                        <div role="status" style={{ fontSize: '13px', color: notice.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            {notice.text}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => send(true)} disabled={!ready || sending !== null}>
                            {sending === 'test' ? 'Sending...' : 'Send test to me'}
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={() => send(false)} disabled={!ready || sending !== null || !subscribers}>
                            <Send size={14} /> {sending === 'all' ? 'Sending...' : `Send to ${subscribers ?? 0} subscriber${subscribers === 1 ? '' : 's'}`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
