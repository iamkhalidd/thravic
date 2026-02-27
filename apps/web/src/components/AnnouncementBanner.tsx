'use client';

import { useEffect, useState } from 'react';
import { X, AlertTriangle, Info, AlertCircle } from 'lucide-react';

type Severity = 'info' | 'warning' | 'critical';

interface Announcement {
    message: string;
    severity: Severity;
}

const DISMISS_KEY = 'tf_announcement_dismissed';

const SEVERITY_STYLES: Record<Severity, { bg: string; border: string; color: string; icon: typeof Info }> = {
    info:     { bg: 'rgba(99,102,241,0.12)',  border: '#6366f1', color: '#a5b4fc', icon: Info          },
    warning:  { bg: 'rgba(245,158,11,0.12)',  border: '#f59e0b', color: '#fcd34d', icon: AlertTriangle  },
    critical: { bg: 'rgba(239,68,68,0.12)',   border: '#ef4444', color: '#fca5a5', icon: AlertCircle   },
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * AnnouncementBanner
 * Fetches the active admin announcement from /api/announcements/active and
 * renders a dismissible top-of-page banner. Dismiss state persists in
 * sessionStorage so it reappears after a fresh session.
 */
export function AnnouncementBanner() {
    const [announcement, setAnnouncement] = useState<Announcement | null>(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        // Check if already dismissed this session
        const wasDismissed = sessionStorage.getItem(DISMISS_KEY);
        if (wasDismissed) {
            setDismissed(true);
            return;
        }

        fetch(`${API_BASE}/api/announcements/active`)
            .then(r => r.json())
            .then(data => {
                if (data.announcement) {
                    setAnnouncement(data.announcement);
                }
            })
            .catch(() => {/* fail silently */});
    }, []);

    const handleDismiss = () => {
        sessionStorage.setItem(DISMISS_KEY, '1');
        setDismissed(true);
    };

    if (!announcement || dismissed) return null;

    const style = SEVERITY_STYLES[announcement.severity] ?? SEVERITY_STYLES.info;
    const Icon = style.icon;

    return (
        <div
            role="alert"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.625rem 1.25rem',
                background: style.bg,
                borderBottom: `1px solid ${style.border}`,
                color: style.color,
                fontSize: '0.875rem',
                zIndex: 60,
                position: 'relative',
            }}
        >
            <Icon size={16} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{announcement.message}</span>
            <button
                onClick={handleDismiss}
                aria-label="Dismiss announcement"
                style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: style.color,
                    padding: '2px',
                    display: 'flex',
                    borderRadius: '4px',
                    opacity: 0.7,
                }}
            >
                <X size={16} />
            </button>
        </div>
    );
}
