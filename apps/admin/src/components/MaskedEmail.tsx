'use client';

// Shows "kh•••@gmail.com" until clicked. Lists of users are often on screen
// during a call or a screen share; this keeps addresses off it unless needed.

import { useState } from 'react';

export function maskEmail(email: string): string {
    const at = email.lastIndexOf('@');
    if (at < 1) return '•••';
    const name = email.slice(0, at);
    return `${name.slice(0, Math.min(2, name.length))}•••${email.slice(at)}`;
}

export function MaskedEmail({ email }: { email: string }) {
    const [shown, setShown] = useState(false);
    if (shown) return <span>{email}</span>;
    return (
        <button
            type="button"
            onClick={() => setShown(true)}
            title="Click to show the full address"
            aria-label={`Show email ${maskEmail(email)}`}
            style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}
        >
            {maskEmail(email)}
        </button>
    );
}
