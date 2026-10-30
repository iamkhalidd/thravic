'use client';

import { useId } from 'react';
import {
    Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { changeWords, compactNumber, shortDay } from './format';
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
    /** What one unit of the lead series is ("visitors"); the tooltip reads "1,240 visitors". */
    unit?: string;
    /** Mark the highest point of the lead series ("Best day · 1.2k"). */
    annotateBest?: boolean;
    /** Name for the highest point, e.g. "Best day" or "Busiest hour". */
    bestLabel?: string;
    /** Line under the chart, after the legend. */
    hint?: string;
}

/**
 * Values over time. The first series is an area (the headline metric) with its
 * best point and latest point marked; others are 2px lines in the next palette
 * slots, comparison series grey and dashed. Monotone curves pass through every
 * point, so they never invent a peak. Hovering shows a dashed crosshair and a
 * tooltip that says the day's value in words, against the comparison when there
 * is one. The legend sits under the plot.
 */
export function TimeSeriesChart({
    data, xKey, series, height = 240, formatValue = compactNumber, formatX = shortDay,
    unit, annotateBest = true, bestLabel = 'Best day', hint = 'Hover the chart for any day',
}: Props) {
    const colors = useChartColors();
    const gradientId = useId().replace(/:/g, '');
    // Comparison series share the neutral grey, so each gets its own dash
    // pattern to stay distinguishable where they overlap.
    const DASHES = ['5 4', '1 3', '8 3 2 3'];
    let slot = 0;
    let mutedSlot = 0;
    const styled = series.map(s => ({
        ...s,
        color: s.muted ? colors.muted : colors.series[slot++ % colors.series.length],
        dash: s.muted ? DASHES[mutedSlot++ % DASHES.length] : undefined,
    }));
    const [lead, ...rest] = styled;
    const compare = styled.find(s => s.muted);
    const empty = data.length === 0 || data.every(row => styled.every(s => !Number(row[s.key])));

    // Highest and latest points of the lead series
    let best: Record<string, unknown> | undefined;
    if (lead && !lead.muted) {
        for (const row of data) {
            const v = Number(row[lead.key]);
            if (Number.isFinite(v) && v > 0 && (!best || v > Number(best[lead.key]))) best = row;
        }
    }
    const last = lead ? [...data].reverse().find(row => row[lead.key] !== null && row[lead.key] !== undefined) : undefined;
    const showBest = annotateBest && !empty && best && data.length > 2;
    const unitText = (n: number) => unit ? `${formatValue(n)} ${unit}` : formatValue(n);

    return (
        <div style={{ position: 'relative' }}>
            <div style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: showBest ? 30 : 8, right: 12, bottom: 0, left: 0 }}>
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={lead?.color} stopOpacity={0.2} />
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
                            cursor={{ stroke: colors.axis, strokeWidth: 1, strokeDasharray: '4 4' }}
                            content={({ active, payload, label }) => {
                                if (!active || !payload?.length || !lead) return null;
                                const row = payload[0]?.payload as Record<string, unknown> | undefined;
                                const now = Number(row?.[lead.key]);
                                const before = compare ? Number(row?.[compare.key]) : NaN;
                                const others = rest.filter(s => !s.muted && row?.[s.key] !== undefined && row?.[s.key] !== null);
                                return (
                                    <div className="chart-tip">
                                        <div className="chart-tip-date">{formatX(String(label))}</div>
                                        {Number.isFinite(now) && !lead.muted && (
                                            <div className="chart-tip-main">{unit ? unitText(now) : <>{lead.label}: {formatValue(now)}</>}</div>
                                        )}
                                        {others.map(s => (
                                            <div key={s.key} className="chart-tip-row">
                                                <span aria-hidden="true" style={{ width: 10, height: 2, background: s.color }} />
                                                {s.label}
                                                <b>{formatValue(Number(row?.[s.key]))}</b>
                                            </div>
                                        ))}
                                        {compare && Number.isFinite(before) && Number.isFinite(now) && (
                                            <div className="chart-tip-note">
                                                {before > 0
                                                    ? <>{changeWords(((now - before) / before) * 100)} the same day before ({formatValue(before)})</>
                                                    : <>{formatValue(before)} the same day before</>}
                                            </div>
                                        )}
                                    </div>
                                );
                            }}
                        />
                        {lead && (
                            <Area
                                type="monotone"
                                dataKey={lead.key}
                                name={lead.label}
                                stroke={lead.color}
                                strokeWidth={lead.muted ? 1.5 : 2.5}
                                strokeDasharray={lead.dash}
                                fill={lead.muted ? 'transparent' : `url(#${gradientId})`}
                                activeDot={{ r: 5, strokeWidth: 2, stroke: colors.surface }}
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
                                activeDot={{ r: 4, strokeWidth: 2, stroke: colors.surface }}
                                isAnimationActive={false}
                            />
                        ))}
                        {showBest && lead && best && (
                            <ReferenceDot
                                x={best[xKey] as string}
                                y={Number(best[lead.key])}
                                r={4}
                                fill={lead.color}
                                stroke={colors.surface}
                                strokeWidth={2}
                                ifOverflow="visible"
                                label={(props: { viewBox?: { cx?: number; cy?: number; x?: number; y?: number } }) => {
                                    const vb = props.viewBox ?? {};
                                    const cx = vb.cx ?? vb.x ?? 0;
                                    const cy = vb.cy ?? vb.y ?? 0;
                                    const text = `${bestLabel} · ${formatValue(Number(best[lead.key]))}`;
                                    const w = text.length * 6.4 + 18;
                                    return (
                                        <g pointerEvents="none">
                                            <rect x={cx - w / 2} y={cy - 30} width={w} height={20} rx={10} fill={colors.text} />
                                            <text x={cx} y={cy - 16.5} textAnchor="middle" fontSize={11} fontWeight={600} fill={colors.surface}>{text}</text>
                                        </g>
                                    );
                                }}
                            />
                        )}
                        {!empty && lead && !lead.muted && last && last !== best && (
                            <ReferenceDot
                                x={last[xKey] as string}
                                y={Number(last[lead.key])}
                                r={4}
                                fill={lead.color}
                                stroke={colors.surface}
                                strokeWidth={2}
                                ifOverflow="visible"
                            />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <div className="chart-foot">
                {styled.length > 1 ? (
                    <ul aria-label="Legend" className="chart-legend">
                        {styled.map(s => (
                            <li key={s.key}>
                                <svg width="16" height="8" aria-hidden="true">
                                    <line x1="0" y1="4" x2="16" y2="4" stroke={s.color} strokeWidth={s.muted ? 1.5 : 2.5} strokeDasharray={s.dash} strokeLinecap="round" />
                                </svg>
                                {s.label}
                            </li>
                        ))}
                    </ul>
                ) : <span />}
                {!empty && hint && <span>{hint}</span>}
            </div>
            {empty && (
                <div className="empty-note" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    No data in this period yet
                </div>
            )}
        </div>
    );
}
