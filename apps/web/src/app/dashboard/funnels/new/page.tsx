'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { useDomain } from '@/contexts/DomainContext';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface FunnelStep {
    id: string;
    name: string;
    type: 'pageview' | 'click' | 'custom';
    condition: {
        field: string;
        operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
        value: string;
    };
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The API matches a step's `matchField` with `matchType` (exact | contains |
// regex) and `matchValue`; this form's richer operators are expressed in those
// terms. Sending the form's `condition` object instead made every create fail.
function toApiStep(step: FunnelStep) {
    const { field, operator, value } = step.condition;
    const match =
        operator === 'equals' ? { matchType: 'exact', matchValue: value }
        : operator === 'contains' ? { matchType: 'contains', matchValue: value }
        : operator === 'startsWith' ? { matchType: 'regex', matchValue: `^${escapeRegex(value)}` }
        : operator === 'endsWith' ? { matchType: 'regex', matchValue: `${escapeRegex(value)}$` }
        : { matchType: 'regex', matchValue: value };
    return { name: step.name, type: step.type, matchField: field, ...match };
}

const stepTypes = [
    { value: 'pageview', label: 'Page view' },
    { value: 'click', label: 'Click' },
    { value: 'custom', label: 'Custom event' }
];

const operators = [
    { value: 'equals', label: 'Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'startsWith', label: 'Starts with' },
    { value: 'endsWith', label: 'Ends with' },
    { value: 'regex', label: 'Regex' }
];

const fieldsByType: Record<string, string[]> = {
    pageview: ['url', 'path', 'referrer'],
    click: ['url', 'path', 'elementId', 'elementClass'],
    custom: ['eventName', 'url', 'path']
};

const fieldLabels: Record<string, string> = {
    url: 'Full URL',
    path: 'Path',
    referrer: 'Referrer',
    elementId: 'Element id',
    elementClass: 'Element class',
    eventName: 'Event name',
};

export default function NewFunnelPage() {
    const router = useRouter();
    const { selectedDomainId } = useDomain();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [steps, setSteps] = useState<FunnelStep[]>([
        {
            id: '1',
            name: 'Landing Page',
            type: 'pageview',
            condition: { field: 'path', operator: 'equals', value: '/' }
        },
        {
            id: '2',
            name: 'Conversion',
            type: 'pageview',
            condition: { field: 'path', operator: 'equals', value: '/thank-you' }
        }
    ]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const addStep = () => {
        const newStep: FunnelStep = {
            id: Date.now().toString(),
            name: `Step ${steps.length + 1}`,
            type: 'pageview',
            condition: { field: 'path', operator: 'equals', value: '' }
        };
        setSteps([...steps, newStep]);
    };

    const removeStep = (id: string) => {
        if (steps.length <= 2) return;
        setSteps(steps.filter(s => s.id !== id));
    };

    const updateStep = (id: string, updates: Partial<FunnelStep>) => {
        setSteps(steps.map(s => {
            if (s.id !== id) return s;

            const updated = { ...s, ...updates };

            // Reset field when type changes
            if (updates.type && updates.type !== s.type) {
                const fields = fieldsByType[updates.type];
                updated.condition = {
                    ...updated.condition,
                    field: fields[0]
                };
            }

            return updated;
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDomainId) return;

        setError('');
        setLoading(true);

        try {
            const token = localStorage.getItem('accessToken');
            const response = await fetch(`${API_URL}/api/funnels/${selectedDomainId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name,
                    description,
                    steps: steps.map(toApiStep)
                })
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to create funnel');
                setLoading(false);
                return;
            }

            router.push('/dashboard/funnels');
        } catch (err) {
            setError('Failed to create funnel');
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="page-stack" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <PageHeader
                title="Create funnel"
                subtitle="Define the steps a visitor takes toward a goal."
                actions={
                    <Link href="/dashboard/funnels" className="btn btn-ghost">
                        <ArrowLeft size={16} />
                        Funnels
                    </Link>
                }
            />

            {error && (
                <div role="alert" className="card" style={{ borderColor: 'var(--color-error)', padding: '12px 16px' }}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-error)', margin: 0 }}>{error}</p>
                </div>
            )}

            {/* Basic info */}
            <ChartCard title="Details">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <div>
                        <label htmlFor="funnel-name" style={labelStyle}>Name</label>
                        <input
                            id="funnel-name"
                            type="text"
                            className="input"
                            placeholder="e.g. Signup flow"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="funnel-description" style={labelStyle}>Description <span style={{ color: 'var(--color-text-muted)' }}>(optional)</span></label>
                        <input
                            id="funnel-description"
                            type="text"
                            className="input"
                            placeholder="What does this funnel track?"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                </div>
            </ChartCard>

            {/* Funnel steps */}
            <ChartCard
                title="Steps"
                subtitle="Visitors must reach each step in order. Between 2 and 10 steps."
                action={
                    <button
                        type="button"
                        onClick={addStep}
                        className="btn btn-secondary"
                        disabled={steps.length >= 10}
                        style={{ padding: '6px 10px', fontSize: '0.8125rem' }}
                    >
                        <Plus size={14} />
                        Add step
                    </button>
                }
            >
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {steps.map((step, index) => (
                        <li
                            key={step.id}
                            style={{
                                padding: 12,
                                background: 'var(--color-bg-tertiary)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--color-border)',
                            }}
                        >
                            <div className="flex items-center gap-sm" style={{ marginBottom: 10 }}>
                                <span aria-hidden="true" style={{
                                    width: 22,
                                    height: 22,
                                    flexShrink: 0,
                                    borderRadius: 'var(--radius-full)',
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-bg-card)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    color: 'var(--color-text-secondary)',
                                    fontVariantNumeric: 'tabular-nums',
                                }}>
                                    {index + 1}
                                </span>
                                <input
                                    type="text"
                                    className="input"
                                    aria-label={`Step ${index + 1} name`}
                                    placeholder="Step name"
                                    value={step.name}
                                    onChange={(e) => updateStep(step.id, { name: e.target.value })}
                                    style={{ flex: 1, minWidth: 0 }}
                                />
                                <button
                                    type="button"
                                    onClick={() => removeStep(step.id)}
                                    className="btn btn-ghost"
                                    disabled={steps.length <= 2}
                                    aria-label={`Remove step ${index + 1}`}
                                    title={steps.length <= 2 ? 'A funnel needs at least 2 steps' : 'Remove step'}
                                    style={{ padding: 6, color: 'var(--color-text-secondary)' }}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                                <div>
                                    <label htmlFor={`type-${step.id}`} style={smallLabelStyle}>Event type</label>
                                    <select
                                        id={`type-${step.id}`}
                                        className="input"
                                        value={step.type}
                                        onChange={(e) => updateStep(step.id, { type: e.target.value as any })}
                                    >
                                        {stepTypes.map(t => (
                                            <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor={`field-${step.id}`} style={smallLabelStyle}>Field</label>
                                    <select
                                        id={`field-${step.id}`}
                                        className="input"
                                        value={step.condition.field}
                                        onChange={(e) => updateStep(step.id, {
                                            condition: { ...step.condition, field: e.target.value }
                                        })}
                                    >
                                        {fieldsByType[step.type].map(f => (
                                            <option key={f} value={f}>{fieldLabels[f] ?? f}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor={`op-${step.id}`} style={smallLabelStyle}>Match</label>
                                    <select
                                        id={`op-${step.id}`}
                                        className="input"
                                        value={step.condition.operator}
                                        onChange={(e) => updateStep(step.id, {
                                            condition: { ...step.condition, operator: e.target.value as any }
                                        })}
                                    >
                                        {operators.map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor={`value-${step.id}`} style={smallLabelStyle}>Value</label>
                                    <input
                                        id={`value-${step.id}`}
                                        type="text"
                                        className="input"
                                        placeholder={step.condition.field === 'path' ? '/signup' : 'value'}
                                        value={step.condition.value}
                                        onChange={(e) => updateStep(step.id, {
                                            condition: { ...step.condition, value: e.target.value }
                                        })}
                                    />
                                </div>
                            </div>
                        </li>
                    ))}
                </ol>
            </ChartCard>

            {/* Submit */}
            <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
                <button
                    type="button"
                    onClick={() => router.push('/dashboard/funnels')}
                    className="btn btn-secondary"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading || !name || steps.length < 2}
                >
                    {loading ? 'Creating…' : 'Create funnel'}
                </button>
            </div>
        </form>
    );
}

const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: '0.8125rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
};

const smallLabelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 4,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
};
