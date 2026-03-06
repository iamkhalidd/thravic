'use client';

import { useState } from 'react';
import {
    FileBarChart,
    Download,
    Mail,
    Calendar,
    Plus,
    FileText,
    Trash2,
    Clock
} from 'lucide-react';

const savedReports = [
    { id: '1', name: 'Weekly Traffic Summary', type: 'traffic', lastRun: '2024-02-05', schedule: 'weekly' },
    { id: '2', name: 'Monthly Conversion Report', type: 'conversions', lastRun: '2024-02-01', schedule: 'monthly' },
    { id: '3', name: 'Campaign Performance', type: 'campaigns', lastRun: '2024-02-04', schedule: null }
];

const reportTypes = [
    { id: 'traffic', name: 'Traffic Overview', description: 'Visitors, sessions, pageviews, and sources' },
    { id: 'behavior', name: 'User Behavior', description: 'Pages, paths, devices, and engagement' },
    { id: 'conversions', name: 'Conversions & Funnels', description: 'Funnel performance and conversion rates' },
    { id: 'campaigns', name: 'Campaign Analysis', description: 'UTM campaign performance metrics' }
];

export default function ReportsPage() {
    const [activeTab, setActiveTab] = useState<'saved' | 'create'>('saved');
    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'pdf'>('csv');

    const handleExport = (format: string) => {
        // This would trigger actual export
        alert(`Exporting as ${format.toUpperCase()}...`);
    };

    const handleCreateReport = () => {
        if (!selectedType) return;
        alert(`Creating ${selectedType} report...`);
    };

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
                    Generate and schedule custom analytics reports
                </p>
            </div>

            {/* Tab Selector */}
            <div style={{ 
                display: 'inline-flex', 
                gap: '4px', 
                marginBottom: 'var(--space-lg)',
                background: 'var(--color-bg-secondary)',
                padding: '4px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)'
            }}>
                <button
                    onClick={() => setActiveTab('saved')}
                    style={{
                        padding: '6px 16px',
                        background: activeTab === 'saved' ? 'var(--color-bg-hover)' : 'transparent',
                        color: activeTab === 'saved' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        border: activeTab === 'saved' ? '1px solid var(--color-border)' : '1px solid transparent',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.8125rem',
                        fontWeight: activeTab === 'saved' ? 500 : 400
                    }}
                >
                    Saved Reports
                </button>
                <button
                    onClick={() => setActiveTab('create')}
                    style={{
                        padding: '6px 16px',
                        background: activeTab === 'create' ? 'var(--color-bg-hover)' : 'transparent',
                        color: activeTab === 'create' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        border: activeTab === 'create' ? '1px solid var(--color-border)' : '1px solid transparent',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.8125rem',
                        fontWeight: activeTab === 'create' ? 500 : 400,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                >
                    <Plus size={14} />
                    Create Report
                </button>
            </div>

            {/* Saved Reports */}
            {activeTab === 'saved' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                    {savedReports.map(report => (
                        <div
                            key={report.id}
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
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--color-primary-alpha)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <FileBarChart size={24} style={{ color: 'var(--color-primary)' }} />
                            </div>

                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontSize: '0.9375rem',
                                    fontWeight: 500,
                                    color: 'var(--color-text-primary)',
                                    marginBottom: '4px'
                                }}>
                                    {report.name}
                                </div>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-md)',
                                    fontSize: '0.75rem',
                                    color: 'var(--color-text-tertiary)'
                                }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock size={12} />
                                        Last run: {report.lastRun}
                                    </span>
                                    {report.schedule && (
                                        <span style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            color: 'var(--color-primary)',
                                            background: 'var(--color-primary-alpha)',
                                            padding: '2px 6px',
                                            borderRadius: 'var(--radius-sm)'
                                        }}>
                                            <Mail size={10} />
                                            {report.schedule}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                                <button
                                    onClick={() => handleExport('csv')}
                                    style={{
                                        padding: 'var(--space-xs) var(--space-sm)',
                                        background: 'var(--color-bg-tertiary)',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        fontSize: '0.75rem',
                                        color: 'var(--color-text-secondary)'
                                    }}
                                >
                                    <Download size={12} />
                                    CSV
                                </button>
                                <button
                                    onClick={() => handleExport('pdf')}
                                    style={{
                                        padding: 'var(--space-xs) var(--space-sm)',
                                        background: 'var(--color-bg-tertiary)',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        fontSize: '0.75rem',
                                        color: 'var(--color-text-secondary)'
                                    }}
                                >
                                    <Download size={12} />
                                    PDF
                                </button>
                                <button
                                    style={{
                                        padding: 'var(--space-xs)',
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: 'var(--color-text-tertiary)'
                                    }}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create Report */}
            {activeTab === 'create' && (
                <div>
                    <div style={{
                        padding: 'var(--space-lg)',
                        background: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--color-border)',
                        marginBottom: 'var(--space-lg)'
                    }}>
                        <h3 style={{
                            fontSize: '0.9375rem',
                            fontWeight: 500,
                            marginBottom: 'var(--space-md)',
                            color: 'var(--color-text-primary)'
                        }}>
                            Select Report Type
                        </h3>
                        <div className="dash-grid-2">
                            {reportTypes.map(type => (
                                <button
                                    key={type.id}
                                    onClick={() => setSelectedType(type.id)}
                                    style={{
                                        padding: 'var(--space-md)',
                                        background: selectedType === type.id ? 'var(--color-primary-alpha)' : 'var(--color-bg-tertiary)',
                                        border: '1px solid',
                                        borderColor: selectedType === type.id ? 'var(--color-primary)' : 'var(--color-border)',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer',
                                        textAlign: 'left'
                                    }}
                                >
                                    <div style={{
                                        fontSize: '0.875rem',
                                        fontWeight: 500,
                                        color: selectedType === type.id ? 'var(--color-primary)' : 'var(--color-text-primary)',
                                        marginBottom: '4px'
                                    }}>
                                        {type.name}
                                    </div>
                                    <div style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--color-text-tertiary)'
                                    }}>
                                        {type.description}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{
                        padding: 'var(--space-lg)',
                        background: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--color-border)',
                        marginBottom: 'var(--space-lg)'
                    }}>
                        <h3 style={{
                            fontSize: '0.9375rem',
                            fontWeight: 500,
                            marginBottom: 'var(--space-md)',
                            color: 'var(--color-text-primary)'
                        }}>
                            Export Format
                        </h3>
                        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                            {(['csv', 'json', 'pdf'] as const).map(format => (
                                <button
                                    key={format}
                                    onClick={() => setExportFormat(format)}
                                    style={{
                                        padding: 'var(--space-sm) var(--space-lg)',
                                        background: exportFormat === format ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
                                        color: exportFormat === format ? 'white' : 'var(--color-text-secondary)',
                                        border: 'none',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer',
                                        fontSize: '0.8125rem',
                                        fontWeight: 500,
                                        textTransform: 'uppercase'
                                    }}
                                >
                                    {format}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handleCreateReport}
                        disabled={!selectedType}
                        style={{
                            padding: 'var(--space-md) var(--space-xl)',
                            background: selectedType ? 'var(--gradient-primary)' : 'var(--color-bg-tertiary)',
                            color: selectedType ? 'white' : 'var(--color-text-tertiary)',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor: selectedType ? 'pointer' : 'not-allowed',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-sm)'
                        }}
                    >
                        <Download size={16} />
                        Generate Report
                    </button>
                </div>
            )}
        </div>
    );
}
