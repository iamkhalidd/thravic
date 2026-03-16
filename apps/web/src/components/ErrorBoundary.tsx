'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[ErrorBoundary]', error, info.componentStack);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 'var(--space-3xl)',
                        textAlign: 'center',
                        gap: 'var(--space-md)',
                        minHeight: '300px',
                    }}
                >
                    <div
                        style={{
                            width: '64px',
                            height: '64px',
                            borderRadius: 'var(--radius-full)',
                            background: 'rgba(239, 68, 68, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <AlertTriangle size={28} style={{ color: 'var(--color-error)' }} />
                    </div>
                    <h4 style={{ color: 'var(--color-text-primary)' }}>
                        Something went wrong
                    </h4>
                    <p style={{
                        color: 'var(--color-text-muted)',
                        fontSize: '0.875rem',
                        maxWidth: '400px',
                    }}>
                       <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-md)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', color: 'var(--color-primary-light)' }}>
                        We encountered an unexpected error displaying this page. Please try refreshing.
                    </div>
                    </p>
                    <button
                        className="btn btn-primary"
                        onClick={this.handleRetry}
                        style={{ gap: 'var(--space-sm)' }}
                    >
                        <RefreshCw size={14} />
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
