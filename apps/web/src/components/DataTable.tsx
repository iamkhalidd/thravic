'use client';

interface Column<T> {
    key: string;
    header: string;
    render?: (row: T) => React.ReactNode;
    align?: 'left' | 'center' | 'right';
    width?: string;
}

interface DataTableProps<T> {
    columns: Column<T>[];
    data: T[];
    loading?: boolean;
    emptyMessage?: string;
    rowCount?: number;       // skeleton rows to show when loading
    onRowClick?: (row: T) => void;
}

export function DataTable<T extends Record<string, any>>({
    columns,
    data,
    loading,
    emptyMessage = 'No data available',
    rowCount = 5,
    onRowClick,
}: DataTableProps<T>) {
    const tableStyles: React.CSSProperties = {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.875rem',
    };

    const thStyles: React.CSSProperties = {
        padding: 'var(--space-sm) var(--space-md)',
        textAlign: 'left',
        fontWeight: 600,
        fontSize: '0.75rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--color-text-muted)',
        borderBottom: '1px solid var(--color-border)',
    };

    const tdStyles: React.CSSProperties = {
        padding: 'var(--space-sm) var(--space-md)',
        borderBottom: '1px solid var(--color-border)',
        color: 'var(--color-text-secondary)',
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {Array.from({ length: rowCount }).map((_, i) => (
                    <div key={i} className="skeleton" style={{ width: '100%', height: '40px' }} />
                ))}
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div style={{
                textAlign: 'center',
                padding: 'var(--space-2xl)',
                color: 'var(--color-text-muted)',
                fontSize: '0.875rem',
            }}>
                {emptyMessage}
            </div>
        );
    }

    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={tableStyles}>
                <thead>
                    <tr>
                        {columns.map((col) => (
                            <th
                                key={col.key}
                                style={{
                                    ...thStyles,
                                    textAlign: col.align || 'left',
                                    width: col.width,
                                }}
                            >
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, i) => (
                        <tr
                            key={i}
                            onClick={() => onRowClick?.(row)}
                            style={{
                                cursor: onRowClick ? 'pointer' : 'default',
                                transition: 'background var(--transition-fast)',
                            }}
                            onMouseEnter={(e) =>
                                (e.currentTarget.style.background = 'var(--color-bg-hover)')
                            }
                            onMouseLeave={(e) =>
                                (e.currentTarget.style.background = 'transparent')
                            }
                        >
                            {columns.map((col) => (
                                <td
                                    key={col.key}
                                    style={{
                                        ...tdStyles,
                                        textAlign: col.align || 'left',
                                    }}
                                >
                                    {col.render ? col.render(row) : row[col.key]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
