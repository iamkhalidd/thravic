'use client';

// A confirm dialog that says what will happen, in place of the browser's
// confirm(). Usage:
//
//   const [confirmDialog, confirm] = useConfirm();
//   if (!(await confirm({ title: 'Turn off sign-ups?', body: '...', confirmLabel: 'Turn off', danger: true }))) return;
//   ...
//   return <>{confirmDialog}...</>;
//
// `typeToConfirm` makes the admin type a word (an email, "DELETE") before the
// button works, for actions that cannot be undone.

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ConfirmOptions {
    title: string;
    body: React.ReactNode;
    confirmLabel?: string;
    danger?: boolean;
    typeToConfirm?: string;
}

interface Pending extends ConfirmOptions {
    resolve: (ok: boolean) => void;
}

export function useConfirm(): [React.ReactNode, (options: ConfirmOptions) => Promise<boolean>] {
    const [pending, setPending] = useState<Pending | null>(null);
    const [typed, setTyped] = useState('');
    const confirmButton = useRef<HTMLButtonElement>(null);

    const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => {
        setTyped('');
        setPending({ ...options, resolve });
    }), []);

    const close = useCallback((ok: boolean) => {
        setPending(current => {
            current?.resolve(ok);
            return null;
        });
    }, []);

    useEffect(() => {
        if (!pending) return;
        if (!pending.typeToConfirm) confirmButton.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [pending, close]);

    const blocked = !!pending?.typeToConfirm && typed.trim() !== pending.typeToConfirm;

    const dialog = pending ? (
        <div className="modal-overlay" onClick={() => close(false)}>
            <div
                className="modal"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: 440 }}
            >
                <h3 className="modal-title" id="confirm-title">{pending.title}</h3>
                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
                    {pending.body}
                </div>
                {pending.typeToConfirm && (
                    <div style={{ marginTop: 'var(--space-md)' }}>
                        <label htmlFor="confirm-type" style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                            Type <strong style={{ color: 'var(--color-text-primary)' }}>{pending.typeToConfirm}</strong> to confirm
                        </label>
                        <input id="confirm-type" className="input" autoFocus value={typed} onChange={e => setTyped(e.target.value)} />
                    </div>
                )}
                <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end', marginTop: 'var(--space-lg)' }}>
                    <button className="btn btn-ghost" onClick={() => close(false)}>Cancel</button>
                    <button
                        ref={confirmButton}
                        className={`btn ${pending.danger ? 'btn-danger' : 'btn-primary'}`}
                        disabled={blocked}
                        onClick={() => close(true)}
                    >
                        {pending.confirmLabel || 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    return [dialog, confirm];
}
