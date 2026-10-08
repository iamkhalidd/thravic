import type { ReactNode } from 'react';

/** The one page header: title, optional one-line description, actions on the right. */
export function PageHeader({ title, subtitle, actions, badge }: {
    title: ReactNode;
    subtitle?: ReactNode;
    actions?: ReactNode;
    /** Small inline element after the title (e.g. a live count). */
    badge?: ReactNode;
}) {
    return (
        <div className="page-header">
            <div style={{ minWidth: 0 }}>
                <h1 className="page-title">{title}{badge}</h1>
                {subtitle && <p className="page-subtitle">{subtitle}</p>}
            </div>
            {actions && <div className="page-actions">{actions}</div>}
        </div>
    );
}
