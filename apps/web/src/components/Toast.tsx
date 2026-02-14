'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { X, CheckCircle2, AlertTriangle, Info, AlertCircle } from 'lucide-react';

// ── Types ───────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
}

interface ToastContextType {
    toast: (type: ToastType, message: string, duration?: number) => void;
}

// ── Context ─────────────────────────────────

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
}

// ── Icons & Colors ──────────────────────────

const toastStyles: Record<ToastType, { bg: string; border: string; icon: typeof CheckCircle2 }> = {
    success: {
        bg: 'rgba(16, 185, 129, 0.1)',
        border: 'var(--color-success)',
        icon: CheckCircle2,
    },
    error: {
        bg: 'rgba(239, 68, 68, 0.1)',
        border: 'var(--color-error)',
        icon: AlertCircle,
    },
    warning: {
        bg: 'rgba(245, 158, 11, 0.1)',
        border: 'var(--color-warning)',
        icon: AlertTriangle,
    },
    info: {
        bg: 'rgba(59, 130, 246, 0.1)',
        border: 'var(--color-info)',
        icon: Info,
    },
};

// ── Provider ────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = useCallback(
        (type: ToastType, message: string, duration: number = 4000) => {
            const id = crypto.randomUUID();
            setToasts((prev) => [...prev, { id, type, message, duration }]);
            if (duration > 0) {
                setTimeout(() => removeToast(id), duration);
            }
        },
        [removeToast]
    );

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}

            {/* Toast container */}
            <div
                style={{
                    position: 'fixed',
                    bottom: 'var(--space-lg)',
                    right: 'var(--space-lg)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-sm)',
                    zIndex: 9999,
                    maxWidth: '400px',
                    width: '100%',
                    pointerEvents: 'none',
                }}
            >
                {toasts.map((t) => {
                    const style = toastStyles[t.type];
                    const Icon = style.icon;
                    return (
                        <div
                            key={t.id}
                            className="animate-fade-in"
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 'var(--space-sm)',
                                padding: 'var(--space-md)',
                                background: 'var(--color-bg-card)',
                                border: `1px solid ${style.border}`,
                                borderLeft: `4px solid ${style.border}`,
                                borderRadius: 'var(--radius-lg)',
                                boxShadow: 'var(--shadow-lg)',
                                fontSize: '0.875rem',
                                color: 'var(--color-text-primary)',
                                pointerEvents: 'auto',
                            }}
                        >
                            <Icon size={18} style={{ color: style.border, flexShrink: 0, marginTop: '1px' }} />
                            <span style={{ flex: 1 }}>{t.message}</span>
                            <button
                                onClick={() => removeToast(t.id)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--color-text-muted)',
                                    padding: 0,
                                    flexShrink: 0,
                                }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}
