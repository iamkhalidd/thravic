import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

import SiteTracker from '../SiteTracker';

type TFWindow = Window & { TF?: (...args: unknown[]) => void };

function trackerScript() {
    return document.head.querySelector<HTMLScriptElement>('script[data-tracking-id]');
}

// Stand in for tf.js finishing its load. happy-dom won't fetch the real file
// (it logs a NotSupportedError, which is expected).
function finishLoad() {
    const tf = vi.fn();
    (window as TFWindow).TF = tf;
    trackerScript()!.onload!(new Event('load'));
    return tf;
}

function setPath(path: string) {
    pathname = path;
    window.history.replaceState(null, '', path);
}

describe('SiteTracker', () => {
    beforeEach(() => {
        document.head.querySelectorAll('script[data-tracking-id]').forEach(s => s.remove());
        delete (window as TFWindow).TF;
        localStorage.clear();
        setPath('/');
    });

    it('loads the script in consent mode on a public page and grants consent once loaded', () => {
        localStorage.setItem('_tf_consent', 'granted');
        render(<SiteTracker trackingId="TF-TEST" apiUrl="https://api.example.com" />);

        const script = trackerScript();
        expect(script?.src).toBe('https://api.example.com/tf.js');
        expect(script?.dataset.trackingId).toBe('TF-TEST');
        expect(localStorage.getItem('_tf_consent')).toBeNull();

        const tf = finishLoad();
        expect(tf).toHaveBeenCalledTimes(1);
        expect(tf).toHaveBeenCalledWith('consent', 'granted');
    });

    it('never loads the script when the visit starts on a private page', () => {
        setPath('/dashboard/settings');
        render(<SiteTracker trackingId="TF-TEST" apiUrl="https://api.example.com" />);
        expect(trackerScript()).toBeNull();
    });

    it('switches off on private pages and back on public ones, without repeat grants', () => {
        const { rerender } = render(<SiteTracker trackingId="TF-TEST" apiUrl="https://api.example.com" />);
        const tf = finishLoad();
        tf.mockClear();

        setPath('/compare');
        rerender(<SiteTracker trackingId="TF-TEST" apiUrl="https://api.example.com" />);
        expect(tf).not.toHaveBeenCalled();

        setPath('/dashboard');
        rerender(<SiteTracker trackingId="TF-TEST" apiUrl="https://api.example.com" />);
        expect(tf).toHaveBeenLastCalledWith('consent', 'denied');

        setPath('/dashboard/sessions');
        rerender(<SiteTracker trackingId="TF-TEST" apiUrl="https://api.example.com" />);
        expect(tf).toHaveBeenCalledTimes(1);

        setPath('/pricing');
        rerender(<SiteTracker trackingId="TF-TEST" apiUrl="https://api.example.com" />);
        expect(tf).toHaveBeenLastCalledWith('consent', 'granted');
        expect(tf).toHaveBeenCalledTimes(2);
    });

    it('does not grant if the visitor reached a private page before the script loaded', () => {
        const { rerender } = render(<SiteTracker trackingId="TF-TEST" apiUrl="https://api.example.com" />);
        setPath('/dashboard');
        rerender(<SiteTracker trackingId="TF-TEST" apiUrl="https://api.example.com" />);

        const tf = finishLoad();
        expect(tf).not.toHaveBeenCalled();
    });
});
