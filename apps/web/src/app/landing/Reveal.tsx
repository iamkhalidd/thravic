'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// Mounts the landing page's demo views only when they scroll into view, so
// their chart animations play where someone can see them instead of off-screen
// at page load. Once visible it also counts the stat tiles up from zero and
// adds `is-visible`, which the CSS uses to grow bars and fade the frame in.

const COUNT_MS = 1200;
// "5,200", "18.4%", "1.6k": a number, optional decimals and an optional suffix
const NUMERIC = /^(\d{1,3}(?:,\d{3})*|\d+)(\.\d+)?(%|k)?$/;

function countUp(root: HTMLElement) {
    const targets = Array.from(root.querySelectorAll<HTMLElement>('.stat-value'))
        .map(el => {
            const text = el.textContent?.trim() ?? '';
            const match = NUMERIC.exec(text);
            if (!match) return null;
            const decimals = match[2] ? match[2].length - 1 : 0;
            const value = parseFloat((match[1] + (match[2] ?? '')).replace(/,/g, ''));
            const commas = match[1].includes(',');
            return { el, text, value, decimals, commas, suffix: match[3] ?? '' };
        })
        .filter(t => t !== null);
    if (!targets.length) return;

    const format = (t: (typeof targets)[number], n: number) => {
        const fixed = n.toFixed(t.decimals);
        if (!t.commas) return fixed + t.suffix;
        const [whole, frac] = fixed.split('.');
        return Number(whole).toLocaleString('en-US') + (frac ? `.${frac}` : '') + t.suffix;
    };

    const start = performance.now();
    const tick = (now: number) => {
        const p = Math.min((now - start) / COUNT_MS, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        for (const t of targets) t.el.textContent = p < 1 ? format(t, t.value * eased) : t.text;
        if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

export default function Reveal({ children, minHeight, className = '' }: { children: ReactNode; minHeight: number; className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (!('IntersectionObserver' in window)) { setVisible(true); return; }
        const observer = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) {
                setVisible(true);
                observer.disconnect();
            }
        }, { rootMargin: '0px 0px -15% 0px' });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!visible || !ref.current) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        // The views load in their own chunk; wait for their stat tiles to appear.
        const root = ref.current;
        let tries = 0;
        const id = window.setInterval(() => {
            if (root.querySelector('.stat-value') || ++tries > 40) {
                window.clearInterval(id);
                countUp(root);
            }
        }, 50);
        return () => window.clearInterval(id);
    }, [visible]);

    return (
        <div ref={ref} className={`lp-reveal${visible ? ' is-visible' : ''} ${className}`} style={visible ? undefined : { minHeight }}>
            {visible ? children : null}
        </div>
    );
}
