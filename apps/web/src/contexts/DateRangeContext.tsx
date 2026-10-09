'use client';

import { createContext, useContext, useState, ReactNode, useMemo, useCallback, useEffect } from 'react';
import { streamLiveUpdates } from '@/lib/api';
import { useDomain } from './DomainContext';

// Live polls at this rate only while the push stream is down
const LIVE_FALLBACK_INTERVAL_MS = 30_000;
// A busy site pushes constantly; re-fetch at most this often (first update is immediate)
const LIVE_MIN_GAP_MS = 5_000;
const LIVE_RETRY_MAX_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Date range presets
export const datePresets = [
    { label: 'Today', value: 'today', days: 1 },
    { label: 'Yesterday', value: 'yesterday', days: 1 },
    { label: 'Last 7 days', value: '7d', days: 7 },
    { label: 'Last 30 days', value: '30d', days: 30 },
    { label: 'Last 90 days', value: '90d', days: 90 },
    { label: 'This month', value: 'month', days: 30 },
    { label: 'Last month', value: 'last_month', days: 30 },
    { label: 'Custom', value: 'custom', days: 0 }
];

interface DateRangeContextType {
    // Current date range
    dateRange: string;
    setDateRange: (range: string) => void;

    // Comparison toggle
    comparisonEnabled: boolean;
    setComparisonEnabled: (enabled: boolean) => void;
    toggleComparison: () => void;

    // Live: re-fetch on an interval and when the tab comes back into view
    live: boolean;
    setLive: (live: boolean) => void;
    // Moves the range end to "now", so every page re-fetches in the background
    refresh: () => void;
    // True when the latest range change came from refresh(), not the user
    background: boolean;
    // True while the API's push stream is connected
    streaming: boolean;

    // Computed date values
    startDate: Date;
    endDate: Date;
    comparisonStartDate: Date | null;
    comparisonEndDate: Date | null;

    // Helper to get API params
    getApiDateParams: () => { startDate: string; endDate: string };
}

const DateRangeContext = createContext<DateRangeContextType | undefined>(undefined);

function getDateRange(rangeValue: string): { start: Date; end: Date } {
    const now = new Date();
    const end = new Date(now);
    let start = new Date(now);

    switch (rangeValue) {
        case 'today':
            start.setHours(0, 0, 0, 0);
            break;
        case 'yesterday':
            start.setDate(start.getDate() - 1);
            start.setHours(0, 0, 0, 0);
            end.setDate(end.getDate() - 1);
            end.setHours(23, 59, 59, 999);
            break;
        case '7d':
            start.setDate(start.getDate() - 7);
            break;
        case '30d':
            start.setDate(start.getDate() - 30);
            break;
        case '90d':
            start.setDate(start.getDate() - 90);
            break;
        case 'month':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'last_month':
            start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            end.setDate(0); // Last day of previous month
            end.setHours(23, 59, 59, 999);
            break;
        default:
            start.setDate(start.getDate() - 30);
    }

    return { start, end };
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
    const [dateRange, setDateRangeState] = useState('30d');
    const [comparisonEnabled, setComparisonState] = useState(false);
    const [refreshTick, setRefreshTick] = useState(0);
    const [background, setBackground] = useState(false);
    const [live, setLiveState] = useState(true);

    // User-driven changes show the loading state; refresh() changes don't.
    const setDateRange = (range: string) => { setBackground(false); setDateRangeState(range); };
    const setComparisonEnabled = (enabled: boolean) => { setBackground(false); setComparisonState(enabled); };
    const toggleComparison = () => { setBackground(false); setComparisonState(prev => !prev); };

    const refresh = useCallback(() => {
        setBackground(true);
        setRefreshTick(t => t + 1);
    }, []);

    useEffect(() => {
        try {
            if (localStorage.getItem('tf_live') === 'false') setLiveState(false);
        } catch { /* storage unavailable */ }
    }, []);

    const setLive = (next: boolean) => {
        setLiveState(next);
        try { localStorage.setItem('tf_live', String(next)); } catch { /* storage unavailable */ }
        if (next) refresh();
    };

    // Live: the API pushes a notice as soon as the domain stores new events.
    const { selectedDomainId } = useDomain();
    const [streaming, setStreaming] = useState(false);
    useEffect(() => {
        if (!live || !selectedDomainId) return;
        const controller = new AbortController();
        let lastRefresh = 0;
        let trailing: ReturnType<typeof setTimeout> | undefined;

        const onUpdate = () => {
            // A hidden tab catches up when it's shown again
            if (document.visibilityState !== 'visible' || trailing) return;
            const wait = lastRefresh + LIVE_MIN_GAP_MS - Date.now();
            const run = () => { trailing = undefined; lastRefresh = Date.now(); refresh(); };
            if (wait <= 0) run();
            else trailing = setTimeout(run, wait);
        };

        (async () => {
            let retryMs = 2_000;
            let opened = false;
            while (!controller.signal.aborted) {
                try {
                    await streamLiveUpdates(selectedDomainId, {
                        onOpen: () => {
                            setStreaming(true);
                            retryMs = 2_000;
                            // After a drop, pick up whatever arrived meanwhile
                            if (opened) onUpdate();
                            opened = true;
                        },
                        onUpdate,
                    }, controller.signal);
                } catch { /* closed or unreachable: retry below */ }
                setStreaming(false);
                if (controller.signal.aborted) return;
                await new Promise(resolve => setTimeout(resolve, retryMs));
                retryMs = Math.min(retryMs * 2, LIVE_RETRY_MAX_MS);
            }
        })();

        return () => {
            controller.abort();
            if (trailing) clearTimeout(trailing);
            setStreaming(false);
        };
    }, [live, selectedDomainId, refresh]);

    // Coming back to the tab always catches up; Live polls only while the stream is down.
    useEffect(() => {
        const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
        document.addEventListener('visibilitychange', onVisible);
        const id = live && !streaming
            ? setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, LIVE_FALLBACK_INTERVAL_MS)
            : undefined;
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            if (id) clearInterval(id);
        };
    }, [live, streaming, refresh]);

    const { startDate, endDate, comparisonStartDate, comparisonEndDate } = useMemo(() => {
        const { start, end } = getDateRange(dateRange);

        // The previous period: same length, ending where this one starts. "Today"
        // is a partial day, so it compares with yesterday up to the same time.
        let compStart: Date | null = null;
        let compEnd: Date | null = null;

        if (comparisonEnabled) {
            const shift = dateRange === 'today' ? DAY_MS : end.getTime() - start.getTime();
            compStart = new Date(start.getTime() - shift);
            compEnd = new Date(end.getTime() - shift);
        }

        return {
            startDate: start,
            endDate: end,
            comparisonStartDate: compStart,
            comparisonEndDate: compEnd
        };
        // refreshTick recomputes "now" so the range end keeps moving forward
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateRange, comparisonEnabled, refreshTick]);

    const getApiDateParams = () => {
        return {
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0]
        };
    };

    return (
        <DateRangeContext.Provider value={{
            dateRange,
            setDateRange,
            comparisonEnabled,
            setComparisonEnabled,
            toggleComparison,
            live,
            setLive,
            refresh,
            background,
            streaming,
            startDate,
            endDate,
            comparisonStartDate,
            comparisonEndDate,
            getApiDateParams
        }}>
            {children}
        </DateRangeContext.Provider>
    );
}

export function useDateRange() {
    const context = useContext(DateRangeContext);
    if (context === undefined) {
        throw new Error('useDateRange must be used within a DateRangeProvider');
    }
    return context;
}

/**
 * The header's date range as the API's `start` / `end` (ISO timestamps). Pages
 * pass these to every analytics call and list `key` in their effect deps, so
 * the range picker in the header drives every page.
 */
export function useApiRange() {
    const { startDate, endDate, comparisonStartDate, comparisonEndDate, background } = useDateRange();
    return useMemo(() => {
        const start = startDate.toISOString();
        const end = endDate.toISOString();
        return {
            start,
            end,
            key: `${start}|${end}`,
            // A Live/tab-focus refresh: re-fetch without swapping the page for skeletons
            background,
            compare: comparisonStartDate && comparisonEndDate
                ? { start: comparisonStartDate.toISOString(), end: comparisonEndDate.toISOString() }
                : null,
        };
    }, [startDate, endDate, comparisonStartDate, comparisonEndDate, background]);
}
