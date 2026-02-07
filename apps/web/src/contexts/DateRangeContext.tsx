'use client';

import { createContext, useContext, useState, ReactNode, useMemo } from 'react';

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
            break;
        default:
            start.setDate(start.getDate() - 30);
    }

    return { start, end };
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
    const [dateRange, setDateRange] = useState('30d');
    const [comparisonEnabled, setComparisonEnabled] = useState(false);

    const toggleComparison = () => setComparisonEnabled(prev => !prev);

    const { startDate, endDate, comparisonStartDate, comparisonEndDate } = useMemo(() => {
        const { start, end } = getDateRange(dateRange);

        // Calculate comparison period (previous period of same length)
        let compStart: Date | null = null;
        let compEnd: Date | null = null;

        if (comparisonEnabled) {
            const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            compEnd = new Date(start);
            compEnd.setDate(compEnd.getDate() - 1);
            compStart = new Date(compEnd);
            compStart.setDate(compStart.getDate() - daysDiff);
        }

        return {
            startDate: start,
            endDate: end,
            comparisonStartDate: compStart,
            comparisonEndDate: compEnd
        };
    }, [dateRange, comparisonEnabled]);

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
