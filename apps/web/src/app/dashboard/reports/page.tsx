'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download, FileText, Loader } from 'lucide-react';
import { exportData, type ExportType } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';

// What GET /api/export/{domainId}?type=... returns: the 10,000 most recent rows.
const datasets: Array<{ type: ExportType; name: string; description: string }> = [
    {
        type: 'sessions',
        name: 'Sessions',
        description: 'One row per visit: start and end time, source, UTM source, browser, screen width and language.',
    },
    {
        type: 'events',
        name: 'Events',
        description: 'One row per tracked event: type, page URL, referrer and time.',
    },
];

export default function ReportsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [downloading, setDownloading] = useState<ExportType | null>(null);
    const [error, setError] = useState<{ message: string; upgrade: boolean } | null>(null);

    const handleDownload = async (type: ExportType) => {
        if (!selectedDomainId) return;
        setDownloading(type);
        setError(null);
        const result = await exportData.downloadCsv(selectedDomainId, type);
        if (result.error) setError({ message: result.error, upgrade: !!result.upgrade });
        setDownloading(null);
    };

    if (!selectedDomainId && !domainLoading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
                <p>Please select a domain to export its data</p>
            </div>
        );
    }

    return (
        <div>
            {/* Page Header */}
            <div style={{ marginBottom: 'var(--space-xl)' }}>
                <h1 style={{
                    fontSize: '1.5rem',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: 'var(--space-xs)'
                }}>
                    Reports
                </h1>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Download this domain&apos;s raw data as CSV, up to the 10,000 most recent rows
                </p>
            </div>

            {error && (
                <div style={{
                    padding: 'var(--space-md)',
                    marginBottom: 'var(--space-lg)',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    borderLeft: '3px solid #ff5555',
                    fontSize: '0.875rem',
                    color: 'var(--color-text-primary)'
                }}>
                    {error.message}
                    {error.upgrade && (
                        <>
                            {' '}
                            <Link href="/dashboard/settings" style={{ color: 'var(--color-text-primary)', textDecoration: 'underline' }}>
                                Upgrade your plan
                            </Link>
                        </>
                    )}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                {datasets.map(dataset => (
                    <div
                        key={dataset.type}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-md)',
                            padding: 'var(--space-lg)',
                            background: 'var(--color-bg-secondary)',
                            borderRadius: 'var(--radius-lg)',
                            border: '1px solid var(--color-border)'
                        }}
                    >
                        <div style={{
                            width: '48px',
                            height: '48px',
                            flexShrink: 0,
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--color-primary-alpha)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <FileText size={24} style={{ color: 'var(--color-text-primary)', textDecoration: 'underline' }} />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                fontSize: '0.9375rem',
                                fontWeight: 500,
                                color: 'var(--color-text-primary)',
                                marginBottom: '4px'
                            }}>
                                {dataset.name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                                {dataset.description}
                            </div>
                        </div>

                        <button
                            onClick={() => handleDownload(dataset.type)}
                            disabled={!selectedDomainId || downloading !== null}
                            style={{
                                padding: 'var(--space-xs) var(--space-md)',
                                background: 'var(--color-bg-tertiary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                cursor: downloading ? 'wait' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '0.8125rem',
                                color: 'var(--color-text-secondary)',
                                flexShrink: 0
                            }}
                        >
                            {downloading === dataset.type
                                ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                : <Download size={14} />}
                            Download CSV
                        </button>
                    </div>
                ))}
            </div>

            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
