'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { domains } from '@/lib/api';

interface DomainData {
    id: string;
    domain: string;
    name: string;
    trackingId: string;
    verified: boolean;
}

/**
 * Hook that loads the current domain and guards access.
 * Redirects to /dashboard/domains if the domain is missing or unauthorized.
 *
 * Usage:
 *   const { domain, loading } = useDomainGuard(domainId);
 */
export function useDomainGuard(domainId: string | undefined | null) {
    const [domain, setDomain] = useState<DomainData | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        if (!domainId) {
            setLoading(false);
            return;
        }

        domains.get(domainId).then((result) => {
            if (result.data) {
                setDomain(result.data);
            } else {
                router.push('/dashboard/domains');
            }
            setLoading(false);
        });
    }, [domainId, router]);

    return { domain, loading };
}
