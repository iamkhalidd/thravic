'use client';

import { useEffect, useState } from 'react';
import { countryOptions } from '@/lib/countries';

/** Country picker storing the ISO code the API expects. Names come from the
 * browser's language, so the list is built after mount: building it during
 * server rendering gave different names than the browser and broke hydration. */
export function CountrySelect({ id, value, onChange, required }: {
    id: string;
    value: string;
    onChange: (code: string) => void;
    required?: boolean;
}) {
    const [options, setOptions] = useState<{ code: string; name: string }[]>([]);
    useEffect(() => setOptions(countryOptions()), []);
    return (
        <select id={id} className="input" value={value} onChange={e => onChange(e.target.value)} required={required}>
            <option value="">Select your country</option>
            {options.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
    );
}
