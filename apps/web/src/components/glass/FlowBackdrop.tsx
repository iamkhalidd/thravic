'use client';

import { useEffect, useRef } from 'react';

/*
 * Backdrop behind the glass: visitor flow lines. Thousands of thin orange
 * streams drift left to right through a slowly changing current, curling and
 * bunching like traffic moving through a site. They swirl gently around the
 * pointer. Each frame paints the base colour faintly over the last one, so the
 * moving points leave soft trails.
 * ~30fps, paused when the tab is hidden, one still frame under reduced motion.
 */

type Theme = 'dark' | 'light';
// pools: soft colour washes painted into the base, [x, y, radius] as fractions of the viewport
type Pool = [number, number, number, string];
const THEMES: Record<Theme, { base: string; pools: Pool[]; fade: number; colors: string[]; alpha: number }> = {
    dark: { base: '#050506', pools: [], fade: 0.045, colors: ['#ff5a1f', '#ff7a3d', '#ffb347', '#c2380e'], alpha: 0.7 },
    // Light is a warm sand, not white, with peach and apricot washes, so the white glass has something to frost
    light: {
        base: '#f1e2d6',
        pools: [
            [0.12, 0.08, 0.65, 'rgba(255, 176, 128, .55)'],
            [0.92, 0.55, 0.6, 'rgba(255, 205, 150, .6)'],
            [0.4, 1.05, 0.55, 'rgba(245, 160, 130, .45)'],
        ],
        fade: 0.055, colors: ['#e8440c', '#ff6a2a', '#ff8a45', '#d4560f'], alpha: 0.7,
    },
};
const currentTheme = (): Theme =>
    document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

type P = { x: number; y: number; px: number; py: number; life: number; c: number; v: number };

export default function FlowBackdrop({ intensity = 1 }: { intensity?: number }) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const wrap = wrapRef.current, canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!wrap || !canvas || !ctx) return;

        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        let theme = THEMES[currentTheme()];
        let w = 0, h = 0, t = 0;
        let ps: P[] = [];
        const ptr = { x: -9999, y: -9999 };

        const spawn = (p: P, anywhere: boolean) => {
            p.x = anywhere ? Math.random() * w : -10 - Math.random() * 40;
            p.y = Math.random() * h;
            p.px = p.x; p.py = p.y;
            p.life = 120 + Math.random() * 260;
            p.c = (Math.random() * theme.colors.length) | 0;
            p.v = 0.7 + Math.random() * 0.9;
            return p;
        };

        // The base (flat colour plus washes) is drawn once off screen, then laid over each frame faintly
        const bg = document.createElement('canvas');
        const bgx = bg.getContext('2d')!;
        const drawBg = () => {
            bg.width = Math.max(1, Math.round(w / 4)); bg.height = Math.max(1, Math.round(h / 4)); // washes are soft, so a small canvas is plenty
            const bw = bg.width, bh = bg.height, m = Math.max(bw, bh);
            bgx.fillStyle = theme.base;
            bgx.fillRect(0, 0, bw, bh);
            for (const [x, y, r, c] of theme.pools) {
                const g = bgx.createRadialGradient(x * bw, y * bh, 0, x * bw, y * bh, r * m);
                g.addColorStop(0, c);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                bgx.fillStyle = g;
                bgx.fillRect(0, 0, bw, bh);
            }
        };
        const paintBase = (a: number) => {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = a;
            ctx.drawImage(bg, 0, 0, w, h);
            ctx.globalAlpha = 1;
        };

        const fit = () => {
            w = wrap.clientWidth; h = wrap.clientHeight;
            canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const n = Math.min(800, Math.round((w * h) / 2000));
            ps = Array.from({ length: n }, () => spawn({ x: 0, y: 0, px: 0, py: 0, life: 0, c: 0, v: 1 }, true));
            drawBg();
            paintBase(1);
        };

        // The current: mostly rightward, bending in slow waves that change over time
        const angle = (x: number, y: number) => {
            const nx = x / w, ny = y / h;
            return Math.sin(nx * 3.1 + t * 0.11) * Math.cos(ny * 4.3 - t * 0.07) * 0.95
                 + Math.sin((nx + ny) * 5.7 - t * 0.05) * 0.45
                 + Math.sin(ny * 9.0 + nx * 2.0 + t * 0.13) * 0.18;
        };

        const step = () => {
            t += 1 / 30;
            paintBase(theme.fade);
            ctx.lineWidth = 1;
            ctx.lineCap = 'round';
            const scale = Math.max(1, Math.min(w, 1600) / 900);
            // Draw per colour so strokes batch into a few paths
            for (let c = 0; c < theme.colors.length; c++) {
                ctx.strokeStyle = theme.colors[c];
                ctx.globalAlpha = theme.alpha;
                ctx.beginPath();
                for (const p of ps) {
                    if (p.c !== c) continue;
                    let a = angle(p.x, p.y);
                    let sp = p.v * 1.3 * scale;
                    // swirl around the pointer, like a visitor's attention pulling traffic
                    const dx = p.x - ptr.x, dy = p.y - ptr.y, d2 = dx * dx + dy * dy;
                    if (d2 < 32000) {
                        const k = 1 - d2 / 32000;
                        a += k * 1.4;
                        sp *= 1 + k * 0.8;
                    }
                    p.px = p.x; p.py = p.y;
                    p.x += Math.cos(a) * sp;
                    p.y += Math.sin(a) * sp;
                    p.life--;
                    if (p.life <= 0 || p.x > w + 10 || p.y < -10 || p.y > h + 10) {
                        spawn(p, p.life <= 0);
                        continue;
                    }
                    ctx.moveTo(p.px, p.py);
                    ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        };

        // onScreen: false when the backdrop is out of view (if a page lets it
        // scroll away), so it stops drawing
        let raf = 0, last = 0, live = !document.hidden, onScreen = true;
        const loop = (ms: number) => {
            raf = requestAnimationFrame(loop);
            if (!live || !onScreen || ms - last < 33) return;
            last = ms;
            step();
        };
        const io = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; });
        io.observe(wrap);

        // Relative to the backdrop, so it lines up whether it is fixed or scrolls with the page
        const onMove = (e: PointerEvent) => {
            const r = wrap.getBoundingClientRect();
            ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top;
        };
        const onLeave = () => { ptr.x = -9999; ptr.y = -9999; };
        const ro = new ResizeObserver(() => {
            if (Math.abs(wrap.clientWidth - w) < 2 && Math.abs(wrap.clientHeight - h) < 80) return; // ignore phone toolbar jiggle
            fit();
            if (reduce) settle();
        });
        const onVis = () => { live = !document.hidden; };
        const mo = new MutationObserver(() => {
            theme = THEMES[currentTheme()];
            for (const p of ps) p.c = (Math.random() * theme.colors.length) | 0;
            drawBg();
            paintBase(1);
            if (reduce) settle();
        });
        // Still frame: run the flow forward off screen so the trails are already drawn
        const settle = () => { for (let i = 0; i < 90; i++) step(); };

        fit();
        ro.observe(wrap);
        document.addEventListener('visibilitychange', onVis);
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        if (reduce) {
            settle();
        } else {
            // start with trails already formed rather than a blank screen
            for (let i = 0; i < 40; i++) step();
            if (window.matchMedia('(pointer: fine)').matches) {
                window.addEventListener('pointermove', onMove, { passive: true });
                document.addEventListener('pointerleave', onLeave);
            }
            raf = requestAnimationFrame(loop);
        }

        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
            mo.disconnect();
            io.disconnect();
            document.removeEventListener('visibilitychange', onVis);
            window.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerleave', onLeave);
        };
    }, []);

    return (
        <div ref={wrapRef} className="page-bg flow" aria-hidden="true">
            <canvas ref={canvasRef} style={{ opacity: intensity }} />
        </div>
    );
}
