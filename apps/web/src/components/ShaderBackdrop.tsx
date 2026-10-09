'use client';

import { useEffect, useState } from 'react';
import { ShaderBackground } from './ui/saddu';

type RGB = [number, number, number];

const hex = (h: string): RGB => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;

// Kept close to each theme's page background so text on top stays readable
const PALETTES: Record<'dark' | 'light', RGB[]> = {
    dark: ['#000000', '#2e2e30', '#151516', '#0a0a0b'].map(hex),
    light: ['#ffffff', '#d9d9de', '#ececef', '#f7f7f8'].map(hex),
};

function currentTheme(): 'dark' | 'light' {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/**
 * Fluted-glass shader that fills its nearest positioned ancestor and sits
 * behind that ancestor's content. Give the parent `position: relative` and
 * `isolation: isolate`. `fade` dissolves the bottom edge into the page.
 */
export default function ShaderBackdrop({ fade = false }: { fade?: boolean }) {
    const [theme, setTheme] = useState<'dark' | 'light' | null>(null);
    const [animate, setAnimate] = useState(true);

    useEffect(() => {
        setTheme(currentTheme());
        setAnimate(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const observer = new MutationObserver(() => setTheme(currentTheme()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);

    // Client-only: WebGL can't render on the server, and the theme is unknown there
    if (!theme) return null;

    const mask = fade ? 'linear-gradient(to bottom, #000 55%, transparent)' : undefined;
    return (
        <div
            aria-hidden
            className="shader-backdrop"
            style={{
                position: 'absolute',
                inset: 0,
                zIndex: -1,
                pointerEvents: 'none',
                overflow: 'hidden',
                maskImage: mask,
                WebkitMaskImage: mask,
            }}
        >
            {/* The shader shades colours down ~30%, which reads as a grey slab on white */}
            <div style={{ height: '100%', opacity: theme === 'light' ? 0.5 : 1 }}>
                <ShaderBackground colors={PALETTES[theme]} animate={animate} />
            </div>
        </div>
    );
}
