'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Download, ImagePlus, Loader, Send, Trash2 } from 'lucide-react';
import { agency, type AgencyBrand, type ClientReportSettings } from '@/lib/api';
import { ChartCard } from '@/components/ChartCard';

const labelStyle: CSSProperties = {
    display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: 6, color: 'var(--color-text-primary)',
};
const helpStyle: CSSProperties = {
    fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: '0 0 12px', lineHeight: 1.5,
};
const MAX_LOGO_BYTES = 512 * 1024;

/** "a@x.com, b@y.com" or one per line → a clean list. */
export function parseRecipients(text: string): string[] {
    return Array.from(new Set(text.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean)));
}

/** "2026-09" → "September 2026". */
export function monthName(key: string): string {
    const [year, month] = key.split('-').map(Number);
    if (!year || !month) return key;
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

/** Reports → Client reports (Agency plan): branding, the monthly email and send/download now. */
export function ClientReports({ domainId }: { domainId: string }) {
    const [settings, setSettings] = useState<ClientReportSettings | null>(null);
    const [brand, setBrand] = useState<AgencyBrand | null>(null);
    const [recipientsText, setRecipientsText] = useState('');
    const [enabled, setEnabled] = useState(false);
    const [busy, setBusy] = useState<'save' | 'brand' | 'logo' | 'send' | 'pdf' | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const load = useCallback(async () => {
        const result = await agency.getReports(domainId);
        if (result.data) {
            setSettings(result.data);
            setBrand(result.data.brand);
            setEnabled(result.data.enabled);
            setRecipientsText(result.data.recipients.join(', '));
        } else {
            setMessage({ type: 'error', text: result.error || 'Could not load client reports' });
        }
    }, [domainId]);

    useEffect(() => {
        setSettings(null);
        setMessage(null);
        load();
    }, [load]);

    const run = async (kind: NonNullable<typeof busy>, action: () => Promise<string | null>) => {
        setBusy(kind);
        setMessage(null);
        try {
            const error = await action();
            if (error) setMessage({ type: 'error', text: error });
        } finally {
            setBusy(null);
        }
    };

    const saveSchedule = () => run('save', async () => {
        const result = await agency.saveReports(domainId, { enabled, recipients: parseRecipients(recipientsText) });
        if (result.error) return result.error;
        setRecipientsText(result.data!.recipients.join(', '));
        setMessage({ type: 'success', text: enabled ? 'Saved. The report goes out on the 1st of each month.' : 'Saved.' });
        return null;
    });

    const saveBrand = () => run('brand', async () => {
        if (!brand) return null;
        const result = await agency.saveBrand({ name: brand.name, color: brand.color, showPoweredBy: brand.showPoweredBy });
        if (result.error) return result.error;
        setBrand(result.data!);
        setMessage({ type: 'success', text: 'Branding saved.' });
        return null;
    });

    const uploadLogo = (file: File) => run('logo', async () => {
        if (file.size > MAX_LOGO_BYTES) return 'Pick an image under 512 KB.';
        const result = await agency.uploadLogo(await readAsDataUrl(file));
        if (result.error) return result.error;
        setBrand(result.data!);
        return null;
    });

    const removeLogo = () => run('logo', async () => {
        const result = await agency.removeLogo();
        if (result.error) return result.error;
        setBrand(result.data!);
        return null;
    });

    const sendNow = () => run('send', async () => {
        const recipients = parseRecipients(recipientsText);
        if (!recipients.length) return 'Add at least one email address first.';
        if (!window.confirm(`Send the ${monthName(settings!.defaultMonth)} report to ${recipients.join(', ')}?`)) return null;
        // Save the list first so Send now uses what's on screen
        const saved = await agency.saveReports(domainId, { enabled, recipients });
        if (saved.error) return saved.error;
        const result = await agency.sendReport(domainId, settings!.defaultMonth);
        if (result.error) return result.error;
        setMessage({ type: 'success', text: `Sent to ${result.data!.sent} ${result.data!.sent === 1 ? 'address' : 'addresses'}.` });
        await load();
        return null;
    });

    const download = () => run('pdf', async () => (await agency.downloadReport(domainId, settings?.defaultMonth)).error || null);

    if (!settings || !brand) {
        return (
            <ChartCard title="Client reports" loading={!message} height={160}>
                {message && <div className="empty-note" style={{ color: 'var(--color-error)' }}>{message.text}</div>}
            </ChartCard>
        );
    }

    const spinner = <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />;

    return (
        <>
            <ChartCard
                title="Client reports"
                subtitle="A monthly PDF in your own brand, emailed to your client: visitors, top pages and sources, conversions and problems, in plain English."
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                    <button className="btn btn-primary" onClick={sendNow} disabled={busy !== null}>
                        {busy === 'send' ? spinner : <Send size={14} />}
                        Send {monthName(settings.defaultMonth)} now
                    </button>
                    <button className="btn btn-secondary" onClick={download} disabled={busy !== null}>
                        {busy === 'pdf' ? spinner : <Download size={14} />}
                        Download PDF
                    </button>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', cursor: 'pointer', marginBottom: 12 }}>
                    <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                    Email last month&apos;s report on the 1st of every month
                </label>
                <label style={labelStyle} htmlFor="report-recipients">Send to</label>
                <textarea
                    id="report-recipients"
                    className="input"
                    rows={2}
                    placeholder="client@example.com, boss@example.com"
                    value={recipientsText}
                    onChange={e => setRecipientsText(e.target.value)}
                    style={{ resize: 'vertical', marginBottom: 6 }}
                />
                <p style={helpStyle}>Up to 10 addresses, separated by commas. Replies go to your account email.</p>
                <button className="btn btn-secondary" onClick={saveSchedule} disabled={busy !== null}>
                    {busy === 'save' ? 'Saving…' : 'Save schedule'}
                </button>

                {message && (
                    <p role={message.type === 'error' ? 'alert' : 'status'} style={{ fontSize: '0.8125rem', margin: '12px 0 0', color: message.type === 'error' ? 'var(--color-error)' : 'var(--color-success)' }}>
                        {message.text}
                    </p>
                )}
            </ChartCard>

            {settings.isBrandOwner ? (
                <ChartCard title="Your branding" subtitle="Used on every client report and client link. Thravic's name only appears if you keep the 'Powered by' line.">
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                        <div style={{ flex: '2 1 240px', minWidth: 0 }}>
                            <label style={labelStyle} htmlFor="brand-name">Agency name</label>
                            <input
                                id="brand-name"
                                className="input"
                                maxLength={80}
                                placeholder="Acme Digital"
                                value={brand.name}
                                onChange={e => setBrand({ ...brand, name: e.target.value })}
                            />
                        </div>
                        <div style={{ flex: '1 1 140px' }}>
                            <label style={labelStyle} htmlFor="brand-color">Brand colour</label>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                    id="brand-color"
                                    type="color"
                                    value={brand.color}
                                    onChange={e => setBrand({ ...brand, color: e.target.value })}
                                    style={{ width: 40, height: 36, border: '1px solid var(--color-border)', borderRadius: 6, background: 'none', padding: 2 }}
                                />
                                <code style={{ fontSize: '0.8125rem' }}>{brand.color}</code>
                            </div>
                        </div>
                    </div>

                    <span style={labelStyle}>Logo</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                        {brand.logoUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={brand.logoUrl} alt="Your logo" style={{ maxHeight: 40, maxWidth: 160, objectFit: 'contain' }} />
                            : <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>No logo yet: reports show your agency name instead.</span>}
                        <label className="btn btn-secondary" style={{ cursor: busy ? 'wait' : 'pointer' }}>
                            {busy === 'logo' ? spinner : <ImagePlus size={14} />}
                            {brand.logoUrl ? 'Replace' : 'Upload'}
                            <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                hidden
                                disabled={busy !== null}
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    e.target.value = '';
                                    if (file) uploadLogo(file);
                                }}
                            />
                        </label>
                        {brand.logoUrl && (
                            <button className="btn btn-ghost" onClick={removeLogo} disabled={busy !== null} aria-label="Remove logo">
                                <Trash2 size={14} /> Remove
                            </button>
                        )}
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', cursor: 'pointer', marginBottom: 12 }}>
                        <input
                            type="checkbox"
                            checked={brand.showPoweredBy}
                            onChange={e => setBrand({ ...brand, showPoweredBy: e.target.checked })}
                        />
                        Show a small &quot;Powered by Thravic&quot; line
                    </label>
                    <button className="btn btn-secondary" onClick={saveBrand} disabled={busy !== null}>
                        {busy === 'brand' ? 'Saving…' : 'Save branding'}
                    </button>
                </ChartCard>
            ) : (
                <ChartCard title="Branding" subtitle="This site's owner sets the logo, name and colour used on its reports.">
                    <div style={{ fontSize: '0.875rem' }}>{brand.name || 'No agency name set yet.'}</div>
                </ChartCard>
            )}

            <ChartCard flush title="Sent reports" subtitle="The last reports emailed for this site.">
                {settings.history.length ? (
                    <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, borderTop: '1px solid var(--color-border)' }}>
                        {settings.history.map((row, index) => (
                            <li key={row.id} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '10px 20px', fontSize: '0.8125rem', borderTop: index ? '1px solid var(--color-border)' : undefined }}>
                                <span style={{ fontWeight: 500, minWidth: 130 }}>{monthName(row.month)}</span>
                                <span style={{ color: 'var(--color-text-secondary)', flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                                    {row.recipients.join(', ')}
                                </span>
                                <span style={{ color: 'var(--color-text-secondary)' }}>
                                    {row.trigger === 'monthly' ? 'Monthly' : 'Sent by hand'} · {new Date(row.sentAt).toLocaleString()}
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="empty-note" style={{ padding: '0 20px 20px' }}>Nothing sent yet.</div>
                )}
            </ChartCard>
        </>
    );
}
