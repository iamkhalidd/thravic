'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Thravic's own script on thravic.com. It runs in consent mode and this
// component grants consent only on public pages, so the dashboard and sign-in
// flows (customer data, tokens in URLs) are never sent or recorded. The script
// tracks client-side navigation itself, so the switch has to follow the route.

const PRIVATE_PREFIXES = ['/dashboard', '/auth', '/complete-profile', '/reset-password'];

function isPrivate(pathname: string) {
    return PRIVATE_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

type TFWindow = Window & { TF?: (...args: unknown[]) => void; __TF_CONFIG__?: Record<string, unknown> };

export default function SiteTracker({ trackingId, apiUrl }: { trackingId: string; apiUrl: string }) {
    const pathname = usePathname();
    const loaded = useRef(false);
    const granted = useRef(false);

    useEffect(() => {
        const w = window as TFWindow;
        const privatePage = isPrivate(pathname);

        if (!loaded.current) {
            // A visit that starts on a private page never loads the script.
            if (privatePage) return;
            loaded.current = true;
            w.__TF_CONFIG__ = { requireConsent: true, respectDoNotTrack: true };
            // Start ungranted so onload's grant is the only pageview, even for
            // a returning visitor whose earlier grant is still stored.
            try { localStorage.removeItem('_tf_consent'); } catch { /* storage blocked */ }
            const script = document.createElement('script');
            script.async = true;
            script.src = `${apiUrl}/tf.js`;
            script.dataset.trackingId = trackingId;
            script.onload = () => {
                granted.current = !isPrivate(window.location.pathname);
                if (granted.current) w.TF?.('consent', 'granted');
            };
            document.head.appendChild(script);
            return;
        }

        // Still loading: onload sets consent for wherever the visitor is by then.
        if (!w.TF) return;
        // Only on a change: granting again would log the pageview twice.
        if (granted.current === !privatePage) return;
        granted.current = !privatePage;
        w.TF?.('consent', privatePage ? 'denied' : 'granted');
    }, [pathname, trackingId, apiUrl]);

    return null;
}
