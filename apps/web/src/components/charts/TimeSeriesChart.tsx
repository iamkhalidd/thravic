'use client';

import { useId } from 'react';
import {
    Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { compactNumber, shortDay } from './format';
import { useChartColors } from './useChartColors';

export interface Series {
    key: string;
    label: string;
    /** A comparison series (previous period, trend, forecast): neutral, dashed. */
    muted?: boolean;
}

interface Props {
    data: Record<string, unknown>[];
    xKey: string;
    series: Series[];
    height?: number;
    formatValue?: (value: number) => string;
    formatX?: (value: string) => string;
}

/**
 * Values over time. The first series is an area (the headline metric); others
 * are 2px lines in the next palette slots, comparison series grey and dashed.
 * Monotone curves pass through every point, so they never invent a peak.
 * A legend appears from two series up; hover shows a crosshair and every value.
 */
export function TimeSeriesChart({
    data, xKey, series, height = 240, formatValue = compactNumber, formatX = shortDay,
}: Props) {
    const colors = useChartColors();
    const gradientId = useId().replace(/:/g, '');
    // Comparison series share the neutral grey, so each gets its own dash
    // pattern to stay distinguishable where they overlap.
    const DASHES = ['4 4', '1 3', '8 3 2 3'];
    let slot = 0;
    let mutedSlot = 0;
    const styled = series.map(s => ({
        ...s,
        color: s.muted ? colors.muted : colors.series[slot++ % colors.series.length],
        dash: s.muted ? DASHES[mutedSlot++ % DASHES.length] : undefined,
    }));
    const [lead, ...rest] = styled;
    const empty = data.length === 0 || data.every(row => styled.every(s => !Number(row[s.key])));

    return (
        <div style={{ position: 'relative' }}>
            {styled.length > 1 && (
                <ul aria-label="Legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', listStyle: 'none', margin: '0 0 8px', padding: 0 }}>
                    {styled.map(s => (
                        <li key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                            <svg width="14" height="8" aria-hidden="true">
                                <line x1="0" y1="4" x2="14" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} />
                            </svg>
                            {s.label}
                        </li>
                    ))}
                </ul>
            )}
            <div style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={lead?.color} stopOpacity={0.22} />
                                <stop offset="100%" stopColor={lead?.color} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke={colors.grid} />
                        <XAxis
                            dataKey={xKey}
                            tickFormatter={v => formatX(String(v))}
                            tick={{ fill: colors.axis, fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={28}
                            tickMargin={8}
                        />
                        <YAxis
                            tickFormatter={v => formatValue(Number(v))}
                            tick={{ fill: colors.axis, fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            width={40}
                            allowDecimals={false}
                        />
                        <Tooltip
                            cursor={{ stroke: colors.axis, strokeWidth: 1 }}
                            content={({ active, payload, label }) => active && payload?.length ? (
                                <div style={{
                                    background: 'var(--color-bg-card)', border: '1px solid var(--color-border-hover)',
                                    borderRadius: 8, padding: '8px 10px', boxShadow: 'var(--shadow-md)', minWidth: 140,
                                }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                                        {formatX(String(label))}
                                    </div>
                                    {styled.map(s => {
                                        const point = payload.find(p => p.dataKey === s.key);
                                        if (!point || point.value === undefined || point.value === null) return null;
                                        return (
                                            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', lineHeight: 1.6 }}>
                                                <span aria-hidden="true" style={{ width: 10, height: 2, background: s.color }} />
                                                <span style={{ color: 'var(--color-text-secondary)', flex: 1 }}>{s.label}</span>
                                                <span style={{ color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                                                    {formatValue(Number(point.value))}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : null}
                        />
                        {lead && (
                            <Area
                                type="monotone"
                                dataKey={lead.key}
                                name={lead.label}
                                stroke={lead.color}
                                strokeWidth={2}
                                strokeDasharray={lead.dash}
                                fill={lead.muted ? 'transparent' : `url(#${gradientId})`}
                                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-bg-card)' }}
                                dot={false}
                                isAnimationActive={false}
                            />
                        )}
                        {rest.map(s => (
                            <Line
                                key={s.key}
                                type="monotone"
                                dataKey={s.key}
                                name={s.label}
                                stroke={s.color}
                                strokeWidth={s.muted ? 1.5 : 2}
                                strokeDasharray={s.dash}
                                dot={false}
                                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-bg-card)' }}
                                isAnimationActive={false}
                            />
                        ))}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            {empty && (
                <div className="empty-note" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    No data in this period yet
                </div>
            )}
        </div>
    );
}
