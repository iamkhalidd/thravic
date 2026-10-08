'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

export interface ChartColors {
    series: string[];
    grid: string;
    axis: string;
    bar: string;
    text: string;
    muted: string;
}

const FALLBACK: ChartColors = {
    series: ['#3987e5', '#d95926', '#199e70'],
    grid: 'rgba(255,255,255,0.06)',
    axis: '#737883',
    bar: 'rgba(57,135,229,0.22)',
    text: '#f4f5f6',
    muted: '#737883',
};

/**
 * Chart colors from the CSS tokens in globals.css (--chart-*), re-read when the
 * theme changes. SVG attributes can't take var(), so charts get resolved values.
 * The palette is the dataviz reference palette, validated on both card surfaces.
 */
export function useChartColors(): ChartColors {
    const { resolvedTheme } = useTheme();
    const [colors, setColors] = useState<ChartColors>(FALLBACK);
    useEffect(() => {
        const css = getComputedStyle(document.documentElement);
        const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
        setColors({
            series: [read('--chart-1', FALLBACK.series[0]), read('--chart-2', FALLBACK.series[1]), read('--chart-3', FALLBACK.series[2])],
            grid: read('--chart-grid', FALLBACK.grid),
            axis: read('--chart-axis', FALLBACK.axis),
            bar: read('--chart-bar', FALLBACK.bar),
            text: read('--color-text-primary', FALLBACK.text),
            muted: read('--color-text-muted', FALLBACK.muted),
        });
    }, [resolvedTheme]);
    return colors;
}
