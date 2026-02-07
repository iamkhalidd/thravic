'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { domains } from '@/lib/api';

interface Domain {
    id: string;
    domain: string;
    name: string;
}

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
                setDomainList(result.data.domains);
                // Auto-select first domain if none selected
                if (!selectedDomainId && result.data.domains.length > 0) {
                    setSelectedDomainId(result.data.domains[0].id);
                }
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
