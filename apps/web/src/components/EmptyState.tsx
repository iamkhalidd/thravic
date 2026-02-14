'use client';

import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: React.ReactNode;
}

export function EmptyState({
    icon: Icon = Inbox,
    title,
    description,
    action,
}: EmptyStateProps) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--space-3xl) var(--space-lg)',
                textAlign: 'center',
                gap: 'var(--space-md)',
            }}
        >
            <div
                style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--color-bg-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <Icon size={28} style={{ color: 'var(--color-text-muted)' }} />
            </div>
            <h4 style={{ color: 'var(--color-text-primary)', fontSize: '1.125rem' }}>
                {title}
            </h4>
            {description && (
                <p style={{
                    color: 'var(--color-text-muted)',
                    fontSize: '0.875rem',
                    maxWidth: '400px',
                    lineHeight: 1.5,
                }}>
                    {description}
                </p>
            )}
            {action}
        </div>
    );
}
