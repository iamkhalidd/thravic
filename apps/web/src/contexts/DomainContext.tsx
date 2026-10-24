'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { domains } from '@/lib/api';
import type { Domain } from '@/types';

interface DomainContextType {
    domains: Domain[];
    selectedDomain: Domain | null;
    selectedDomainId: string | null;
    setSelectedDomainId: (id: string) => void;
    loading: boolean;
    refresh: () => Promise<void>;
}

const DomainContext = createContext<DomainContextType | undefined>(undefined);

export function DomainProvider({ children }: { children: ReactNode }) {
    const [domainList, setDomainList] = useState<Domain[]>([]);
    const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const loadDomains = async () => {
        setLoading(true);
        try {
            const result = await domains.list();
            if (result.data?.domains) {
                const list = result.data.domains;
                setDomainList(list);
                // A link from an alert email names its site (?site=<id>); open on that one
                // and drop the param so a later reload keeps whatever the user picks next.
                const params = new URLSearchParams(window.location.search);
                const linked = params.get('site');
                if (linked) {
                    params.delete('site');
                    const query = params.toString();
                    window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
                }
                // Otherwise keep the selection if it still exists; on first load, or if the
                // selected site was deleted, fall back to the first site, or none.
                setSelectedDomainId(current =>
                    linked && list.some(d => d.id === linked) ? linked
                        : current && list.some(d => d.id === current) ? current : list[0]?.id ?? null);
            }
        } catch (error) {
            console.error('Failed to load domains:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDomains();
    }, []);

    const selectedDomain = domainList.find(d => d.id === selectedDomainId) || null;

    return (
        <DomainContext.Provider value={{
            domains: domainList,
            selectedDomain,
            selectedDomainId,
            setSelectedDomainId,
            loading,
            refresh: loadDomains
        }}>
            {children}
        </DomainContext.Provider>
    );
}

export function useDomain() {
    const context = useContext(DomainContext);
    if (context === undefined) {
        throw new Error('useDomain must be used within a DomainProvider');
    }
    return context;
}
