'use client';

import { useEffect } from 'react';

// Scroll motion for the landing page: section headings fade and rise a few
// pixels as they enter the viewport, with a small stagger inside each head.
// Everything else is already in place when it scrolls into view, so content
// is never hidden while someone scrolls fast. The CSS lives under
// "Scroll motion" in globals.css. With reduced motion nothing runs.

const SELECTOR = '.lp-section-head > *, .lp-split > div:first-child > *';
const STAGGER_MS = 60;
const MAX_STAGGER = 3;

export default function ScrollEffects() {
    useEffect(() => {
        const root = document.documentElement;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const el = entry.target as HTMLElement;
                el.classList.add('sr-in');
                observer.unobserve(el);
            }
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

        document.querySelectorAll<HTMLElement>(SELECTOR).forEach(el => {
            // Anything already on screen at load shows as is
            if (el.getBoundingClientRect().top < window.innerHeight) return;
            const siblings = el.parentElement ? Array.from(el.parentElement.children) : [el];
            el.classList.add('sr');
            el.style.setProperty('--sr-delay', `${Math.min(siblings.indexOf(el), MAX_STAGGER) * STAGGER_MS}ms`);
            observer.observe(el);
        });
        root.classList.add('lp-motion');

        return () => {
            observer.disconnect();
            root.classList.remove('lp-motion');
        };
    }, []);

    return null;
}
