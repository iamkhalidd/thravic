'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Generic hook for API calls with loading, error, and retry.
 * Replaces the repeated fetch → setState → setLoading → setError pattern.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useApi(() => analytics.getOverview(domainId));
 *   const { data, loading } = useApi(() => sources.getOverview(domainId), [domainId, dateRange]);
 */
export function useApi<T>(
    fetcher: () => Promise<{ data?: T; error?: string }>,
    deps: unknown[] = [],
    options?: { enabled?: boolean }
) {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);

    const fetch = useCallback(async () => {
        if (options?.enabled === false) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const result = await fetcher();
            if (!mountedRef.current) return;
            if (result.error) {
                setError(result.error);
                setData(null);
            } else {
                setData(result.data ?? null);
            }
        } catch (e) {
            if (!mountedRef.current) return;
            setError(e instanceof Error ? e.message : 'An unexpected error occurred');
            setData(null);
        } finally {
            if (mountedRef.current) setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    useEffect(() => {
        mountedRef.current = true;
        fetch();
        return () => {
            mountedRef.current = false;
        };
    }, [fetch]);

    return { data, error, loading, refetch: fetch };
}
