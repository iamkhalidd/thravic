'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export const THEME_KEY = 'thravic-admin-theme';

type Theme = 'dark' | 'light';

/** Light/dark switch. The choice lives on <html data-theme> and in localStorage. */
export function ThemeToggle() {
    const [theme, setTheme] = useState<Theme | null>(null);

    useEffect(() => {
        setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    }, []);

    if (!theme) return <div style={{ width: 32, height: 32, flexShrink: 0 }} />;

    const toggle = () => {
        const next: Theme = theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try {
            localStorage.setItem(THEME_KEY, next);
        } catch {
            // Private mode or blocked storage: the switch still works for this visit.
        }
        setTheme(next);
    };

    const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    return (
        <button type="button" className="icon-btn" onClick={toggle} title={label} aria-label={label}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
    );
}
