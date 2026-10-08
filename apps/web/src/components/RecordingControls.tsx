'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    domains,
    RECORDING_DAILY_LIMITS,
    RECORDING_SAMPLE_RATES,
    type DomainSettings,
} from '@/lib/api';

type Pending = 'start' | 'promptOff' | null;

/**
 * Session recording on/off, how many visits are recorded, and visitor consent,
 * for one domain. Turning recording on, or the visitor prompt off, first shows
 * the site owner what that means and asks them to confirm.
 */
export default function RecordingControls({
    domainId,
    startedToday,
    locked,
}: {
    domainId: string;
    /** Recordings started today (UTC), from the recordings list. */
    startedToday: number | null;
    /** The owner's plan has no recordings. */
    locked: boolean;
}) {
    const [settings, setSettings] = useState<DomainSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const [pending, setPending] = useState<Pending>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setSettings(null);
        setPending(null);
        setError(null);
        domains.get(domainId).then(({ data, error }) => {
            if (data) setSettings(data.settings);
            if (error) setError(error);
        });
    }, [domainId]);

    const save = async (changes: Partial<DomainSettings>) => {
        if (!settings) return;
        setSaving(true);
        setError(null);
        const { data, error } = await domains.updateSettings(domainId, changes);
        if (data) setSettings(data.settings);
        else setError(error || 'Could not save the setting');
        setSaving(false);
        setPending(null);
    };

    if (!settings) {
        return error ? <div className="card" role="alert">{error}</div> : null;
    }

    const on = settings.sessionRecording && !locked;
    const limitReached = on && startedToday !== null && startedToday >= settings.recordingDailyLimit;

    return (
        <div className="card">
            <div className="flex items-center justify-between" style={{ gap: 'var(--space-md)', flexWrap: 'wrap' }}>
                <div>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span aria-hidden style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: on ? (limitReached ? '#f59e0b' : '#22c55e') : 'var(--color-text-muted)',
                        }} />
                        {on ? (limitReached ? 'Recording paused — daily limit reached' : 'Recording on') : 'Recording off'}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {locked ? (
                            <>Session recording needs the Pro plan. <Link href="/dashboard/settings" style={{ textDecoration: 'underline' }}>Upgrade</Link></>
                        ) : on ? (
                            <>
                                {startedToday ?? 0} of {settings.recordingDailyLimit} recordings today (resets at midnight UTC)
                                {settings.recordingConsentPrompt ? ' · visitors are asked first' : ' · your site handles consent'}
                            </>
                        ) : (
                            'No visits are recorded.'
                        )}
                    </div>
                </div>
                {!locked && (
                    on ? (
                        <button className="btn btn-secondary" disabled={saving} onClick={() => save({ sessionRecording: false })}>
                            Stop recording
                        </button>
                    ) : (
                        <button className="btn btn-primary" disabled={saving} onClick={() => setPending('start')}>
                            Start recording
                        </button>
                    )
                )}
            </div>

            {!locked && (
                <div className="flex items-center" style={{ gap: 'var(--space-lg)', flexWrap: 'wrap', marginTop: 'var(--space-md)', fontSize: '0.875rem' }}>
                    <label className="flex items-center gap-sm">
                        Record
                        <select
                            className="input"
                            style={{ width: 'auto', padding: 'var(--space-xs) var(--space-sm)' }}
                            value={settings.recordingSampleRate}
                            disabled={saving}
                            onChange={(e) => save({ recordingSampleRate: Number(e.target.value) })}
                        >
                            {RECORDING_SAMPLE_RATES.map(rate => <option key={rate} value={rate}>{rate}%</option>)}
                        </select>
                        of visits
                    </label>
                    <label className="flex items-center gap-sm">
                        Up to
                        <select
                            className="input"
                            style={{ width: 'auto', padding: 'var(--space-xs) var(--space-sm)' }}
                            value={settings.recordingDailyLimit}
                            disabled={saving}
                            onChange={(e) => save({ recordingDailyLimit: Number(e.target.value) })}
                        >
                            {RECORDING_DAILY_LIMITS.map(limit => <option key={limit} value={limit}>{limit}</option>)}
                        </select>
                        recordings a day
                    </label>
                    <label className="flex items-center gap-sm">
                        <input
                            type="checkbox"
                            checked={settings.recordingConsentPrompt}
                            disabled={saving}
                            onChange={(e) => (e.target.checked ? save({ recordingConsentPrompt: true }) : setPending('promptOff'))}
                        />
                        Ask visitors before recording
                    </label>
                </div>
            )}

            {pending === 'start' && (
                <div role="region" aria-label="Before you start recording" style={panelStyle}>
                    <h4 style={{ marginBottom: 'var(--space-sm)' }}>Before you start recording</h4>
                    <ul style={{ paddingLeft: '1.2rem', margin: '0 0 var(--space-md)', lineHeight: 1.6, fontSize: '0.875rem' }}>
                        <li><strong>Recorded:</strong> the pages visitors see, mouse movement, clicks and scrolling.</li>
                        <li><strong>Never recorded:</strong> anything typed — passwords, card numbers and messages are masked in the visitor&apos;s browser and again on our server.</li>
                        <li>
                            {settings.recordingConsentPrompt
                                ? 'Each visitor is asked first and can say no; nothing is recorded until they allow it.'
                                : 'Visitors are not asked by Thravic: your site must collect their consent and call TF(\'consent\', \'granted\').'}
                        </li>
                        <li>Use recordings only to analyse and improve your site — not to identify or profile individual people.</li>
                        <li>Mention session recording in your privacy policy. To let visitors withdraw, link to <code>TF(&apos;revokeRecordingConsent&apos;)</code>.</li>
                        <li>Add class <code>tf-block</code> to leave an element out of recordings, or <code>tf-mask</code> to hide its text.</li>
                    </ul>
                    <div className="flex gap-sm">
                        <button className="btn btn-ghost" onClick={() => setPending(null)}>Cancel</button>
                        <button className="btn btn-primary" disabled={saving} onClick={() => save({ sessionRecording: true })}>
                            I understand — start recording
                        </button>
                    </div>
                </div>
            )}

            {pending === 'promptOff' && (
                <div role="region" aria-label="Stop asking visitors" style={panelStyle}>
                    <p style={{ fontSize: '0.875rem', marginBottom: 'var(--space-md)' }}>
                        Only turn this off if your site already asks visitors for consent (for example in its cookie banner)
                        and calls <code>TF(&apos;consent&apos;, &apos;granted&apos;)</code> with the tracker&apos;s <code>requireConsent</code> option on.
                        Recording without consent breaks privacy law in many countries, and that consent is then your responsibility.
                    </p>
                    <div className="flex gap-sm">
                        <button className="btn btn-ghost" onClick={() => setPending(null)}>Keep asking visitors</button>
                        <button className="btn btn-secondary" disabled={saving} onClick={() => save({ recordingConsentPrompt: false })}>
                            My site handles consent
                        </button>
                    </div>
                </div>
            )}

            {error && <p role="alert" style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: 'var(--space-sm)' }}>{error}</p>}
        </div>
    );
}

const panelStyle = {
    marginTop: 'var(--space-md)',
    padding: 'var(--space-md)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg-secondary)',
} as const;
