'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download, FileText, Loader } from 'lucide-react';
import { exportData, type ExportType } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';

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

    const header = (
        <PageHeader
            title="Reports"
            subtitle="Download this site's raw data as CSV, up to the 10,000 most recent rows."
        />
    );

    if (!selectedDomainId && !domainLoading) {
        return (
            <div className="page-stack">
                {header}
                <div className="card"><div className="empty-note">Select a site to export its data.</div></div>
            </div>
        );
    }

    return (
        <div className="page-stack">
            {header}

            {error && (
                <div role="alert" className="card" style={{ borderColor: 'var(--color-error)', padding: '12px 16px', fontSize: '0.875rem' }}>
                    <span style={{ color: 'var(--color-error)' }}>{error.message}</span>
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

            <ChartCard flush title="CSV exports" subtitle="Each file holds the most recent rows, newest first.">
                <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, borderTop: '1px solid var(--color-border)' }}>
                    {datasets.map((dataset, index) => (
                        <li
                            key={dataset.type}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '12px 20px',
                                borderTop: index ? '1px solid var(--color-border)' : undefined,
                                flexWrap: 'wrap',
                            }}
                        >
                            <FileText size={16} aria-hidden="true" style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                                    {dataset.name}
                                </div>
                                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                                    {dataset.description}
                                </div>
                            </div>
                            <button
                                onClick={() => handleDownload(dataset.type)}
                                disabled={!selectedDomainId || downloading !== null}
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '0.8125rem', cursor: downloading ? 'wait' : undefined, flexShrink: 0 }}
                            >
                                {downloading === dataset.type
                                    ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                    : <Download size={14} />}
                                Download CSV
                            </button>
                        </li>
                    ))}
                </ul>
            </ChartCard>

            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
