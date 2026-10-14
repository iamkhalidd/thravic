'use client';

import { useEffect, useRef, useState } from 'react';

// The hero's "what Thravic does" as a short story on a loop: a recorded visit
// plays back, the visitor rage-clicks a button that does nothing and leaves,
// Thravic flags it, then the page's heatmap shows it wasn't just one person.
// Movement (cursor, ripples, heatmap) is CSS animation (see .lp-replay in
// globals.css); the script reads that animation's clock and switches the
// steps, timeline events and click counter in time with it. Decorative, so
// hidden from screen readers; the headline above says the same thing in words.

const LOOP_MS = 12_000;
// The recorded visit is longer than the loop; the clock shows its timestamps.
const VISIT_START_S = 47;
const VISIT_SECONDS = 22;
// Fractions of the loop. Keep in step with the keyframes in globals.css.
const CLICKS = [0.28, 0.31, 0.34, 0.37];
const LEFT_AT = 0.52;
const STEPS = [
    { from: 0, to: 0.27, title: 'Watch the visit', text: 'Every click and scroll, replayed' },
    { from: 0.27, to: 0.55, title: 'Catch the frustration', text: 'Rage clicks are flagged for you' },
    { from: 0.55, to: 1, title: 'See the pattern', text: 'Heatmaps show it isn’t just one person' },
];
const EVENTS = [
    { at: 0.03, label: 'Landed on /pricing', kind: 'nav' },
    { at: 0.12, label: 'Compared Starter and Pro', kind: 'view' },
    { at: 0.28, label: 'Clicked “Choose plan”', kind: 'click' },
    { at: 0.38, label: 'Rage click: 4 clicks, no response', kind: 'rage' },
    { at: LEFT_AT, label: 'Left the site', kind: 'exit' },
];
const PLANS = [
    { name: 'Starter', price: '$9', features: ['3 projects', 'Email support'] },
    { name: 'Pro', price: '$29', features: ['Unlimited projects', 'Priority support'], popular: true },
    { name: 'Team', price: '$79', features: ['10 seats', 'SSO & audit log'] },
];
// A still frame for reduced motion: just after the rage click, events up to it shown.
const STILL_FRAME = 0.45;

function clock(seconds: number) {
    const s = Math.floor(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function HeroReplay() {
    const [elapsed, setElapsed] = useState(0);
    const progressRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setElapsed(STILL_FRAME);
            return;
        }
        const start = performance.now();
        const id = window.setInterval(() => {
            // Read the progress bar's own CSS animation so everything agrees with
            // it; the two start at different moments (first paint vs hydration).
            const animation = progressRef.current?.getAnimations?.()[0];
            const time = typeof animation?.currentTime === 'number' ? animation.currentTime : performance.now() - start;
            setElapsed((time % LOOP_MS) / LOOP_MS);
        }, 100);
        return () => window.clearInterval(id);
    }, []);

    const step = Math.max(STEPS.findIndex(s => elapsed >= s.from && elapsed < s.to), 0);
    const clicks = elapsed < LEFT_AT ? CLICKS.filter(c => elapsed >= c).length : 0;
    const hovering = elapsed >= 0.08 && elapsed < 0.2;

    return (
        <div className="lp-replay-wrap" data-step={step} aria-hidden="true">
            <ol className="lp-replay-steps">
                {STEPS.map((s, i) => (
                    <li key={s.title} className={i === step ? 'is-active' : i < step ? 'is-done' : ''}>
                        <span
                            className="lp-replay-step-fill"
                            style={{ width: i === step ? `${((elapsed - s.from) / (s.to - s.from)) * 100}%` : i < step ? '100%' : '0%' }}
                        />
                        <span className="lp-replay-step-num">{i + 1}</span>
                        <span className="lp-replay-step-copy">
                            <strong>{s.title}</strong>
                            <em>{s.text}</em>
                        </span>
                    </li>
                ))}
            </ol>

            <div className="lp-replay">
                <div className="lp-replay-chrome">
                    <span className="lp-replay-dots"><i /><i /><i /></span>
                    <span className="lp-replay-url">acme.shop/pricing</span>
                    <span className="lp-replay-rec"><i />Replay</span>
                </div>

                <div className="lp-replay-body">
                    <div className="lp-replay-stage">
                        {/* The visitor's page */}
                        <div className="lp-replay-page">
                            <div className="lp-replay-nav">
                                <b>acme</b>
                                <span>Shop</span><span>Pricing</span><span>Help</span>
                            </div>
                            <div className="lp-replay-title">Simple pricing</div>
                            <div className="lp-replay-sub">Pick a plan. Cancel any time.</div>
                            <div className="lp-replay-cards">
                                {PLANS.map((plan, i) => (
                                    <div
                                        key={plan.name}
                                        className={`lp-replay-card${plan.popular ? ' is-target' : ''}${i === 0 && hovering ? ' is-hover' : ''}`}
                                    >
                                        {plan.popular && <span className="lp-replay-badge">Popular</span>}
                                        <span className="lp-replay-card-name">{plan.name}</span>
                                        <span className="lp-replay-card-price">{plan.price}<small>/mo</small></span>
                                        {plan.features.map(f => <span key={f} className="lp-replay-card-feature">✓ {f}</span>)}
                                        <span className="lp-replay-card-btn">Choose plan</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Heatmap of every visit to this page, shown once the story lands */}
                        <div className="lp-replay-heat">
                            <span className="hot" />
                            <span className="warm a" />
                            <span className="warm b" />
                            <span className="cool" />
                        </div>
                        <span className="lp-replay-heat-label">62% of clicks land on this button</span>

                        <span className="lp-replay-ripple" />
                        <span className="lp-replay-ripple r2" />
                        <span className="lp-replay-ripple r3" />
                        <span className="lp-replay-ripple r4" />
                        {clicks > 0 && <span key={clicks} className="lp-replay-count">×{clicks}</span>}

                        <svg className="lp-replay-cursor" width="22" height="22" viewBox="0 0 24 24">
                            <path d="M4 2.5 19.5 11l-6.6 1.9L9.6 19.6z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
                        </svg>

                        <div className="lp-replay-toast">
                            <span className="lp-replay-toast-dot" />
                            <span>
                                <strong>Rage click detected</strong>
                                <em>“Choose plan” clicked 4 times, nothing happened</em>
                            </span>
                        </div>
                    </div>

                    <aside className="lp-replay-panel">
                        <div className="lp-replay-panel-head">
                            <strong>Session timeline</strong>
                            <span>Visitor #4,812 · Chrome · Lagos</span>
                        </div>
                        <ul className="lp-replay-events">
                            {EVENTS.map(e => (
                                <li key={e.label} className={`is-${e.kind}${elapsed >= e.at ? ' is-shown' : ''}`}>
                                    <i />
                                    <span>{e.label}</span>
                                    <time>{clock(VISIT_START_S + e.at * VISIT_SECONDS)}</time>
                                </li>
                            ))}
                        </ul>
                    </aside>
                </div>

                <div className="lp-replay-bar">
                    <span className="lp-replay-time">{clock(VISIT_START_S + elapsed * VISIT_SECONDS)}</span>
                    <span className="lp-replay-track">
                        <span ref={progressRef} className="lp-replay-progress" />
                        <span className="lp-replay-marker" />
                    </span>
                    <span className="lp-replay-time">{clock(VISIT_START_S + VISIT_SECONDS)}</span>
                </div>
            </div>
        </div>
    );
}
