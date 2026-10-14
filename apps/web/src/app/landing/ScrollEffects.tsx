'use client';

import { useEffect } from 'react';

// Scroll motion for the landing page, in one place so page.tsx stays markup:
//   - a reading-progress bar along the top edge
//   - the hero replay tilts back in 3D and flattens as it scrolls into view
//   - blocks fade and rise into place as they enter the viewport, staggered
//     within a group, with the story copy and screenshots sliding in from
//     opposite sides
// Everything is CSS driven by classes and two custom properties set here (see
// "Scroll motion" in globals.css). With reduced motion none of it runs and the
// page renders as plain static content.

// Groups that reveal together; the children of each match stagger in order.
const GROUPS: { selector: string; variant?: string }[] = [
    { selector: '.lp-hero-content > :not(.lp-hero-stage)' },
    { selector: '.lp-section-head > *', variant: 'blur' },
    { selector: '.lp-steps > .lp-step' },
    { selector: '.lp-story-grid > .lp-story-grid-text', variant: 'left' },
    { selector: '.lp-story-grid > .lp-story-grid-mockup', variant: 'right' },
    { selector: '.lp-story-grid-reverse > .lp-story-grid-text', variant: 'right' },
    { selector: '.lp-story-grid-reverse > .lp-story-grid-mockup', variant: 'left' },
    { selector: '.lp-split > div > *', variant: 'blur' },
    { selector: '.lp-also > div' },
    { selector: '.lp-checks > li' },
    { selector: '.lp-pricing > .lp-plan', variant: 'scale' },
    { selector: '.lp-cta-final > div > *', variant: 'blur' },
];
const STAGGER_MS = 70;
const MAX_STAGGER = 6;

export default function ScrollEffects() {
    useEffect(() => {
        const root = document.documentElement;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        // ── Reveals ──
        const observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const el = entry.target as HTMLElement;
                el.classList.add('sr-in');
                observer.unobserve(el);
                // Hand the element back to its own styles once it has landed, so
                // hover transitions (cards lifting) don't inherit the delay.
                window.setTimeout(() => {
                    el.classList.remove('sr', 'sr-in', 'sr-blur', 'sr-left', 'sr-right', 'sr-scale');
                    el.style.removeProperty('--sr-delay');
                }, 1400);
            }
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

        for (const { selector, variant } of GROUPS) {
            document.querySelectorAll<HTMLElement>(selector).forEach(el => {
                // Stagger by position among the siblings that share this group.
                const siblings = el.parentElement ? Array.from(el.parentElement.children) : [el];
                const index = Math.min(siblings.indexOf(el), MAX_STAGGER);
                el.classList.add('sr');
                if (variant) el.classList.add(`sr-${variant}`);
                el.style.setProperty('--sr-delay', `${index * STAGGER_MS}ms`);
                observer.observe(el);
            });
        }

        // ── Progress bar and hero tilt, one rAF per scroll frame ──
        const stage = document.querySelector<HTMLElement>('.lp-hero-stage');
        let frame = 0;
        const update = () => {
            frame = 0;
            const max = root.scrollHeight - window.innerHeight;
            root.style.setProperty('--lp-scroll', String(max > 0 ? Math.min(window.scrollY / max, 1) : 0));
            if (stage) {
                // 0 while the stage's top sits low in the viewport, 1 once it has
                // risen to the upper third.
                const top = stage.getBoundingClientRect().top;
                const vh = window.innerHeight;
                const flat = Math.min(Math.max((vh * 0.95 - top) / (vh * 0.6), 0), 1);
                stage.style.setProperty('--lp-flat', flat.toFixed(3));
            }
        };
        const onScroll = () => {
            if (!frame) frame = requestAnimationFrame(update);
        };
        update();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        root.classList.add('lp-motion');

        return () => {
            observer.disconnect();
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
            if (frame) cancelAnimationFrame(frame);
            root.classList.remove('lp-motion');
            root.style.removeProperty('--lp-scroll');
        };
    }, []);

    return <div className="lp-scroll-progress" aria-hidden="true" />;
}
