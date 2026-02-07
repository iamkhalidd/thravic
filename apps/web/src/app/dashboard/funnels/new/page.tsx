'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Plus,
    Trash2,
    ArrowRight,
    GripVertical,
    MousePointer2,
    Globe,
    Zap
} from 'lucide-react';
import { domains } from '@/lib/api';

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

const stepTypes = [
    { value: 'pageview', label: 'Page View', icon: Globe },
    { value: 'click', label: 'Click', icon: MousePointer2 },
    { value: 'custom', label: 'Custom Event', icon: Zap }
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

export default function NewFunnelPage() {
    const router = useRouter();
    const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
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

    useEffect(() => {
        domains.list().then(result => {
            if (result.data && result.data.domains.length > 0) {
                setSelectedDomainId(result.data.domains[0].id);
            }
        });
    }, []);

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
                    steps: steps.map(s => ({
                        name: s.name,
                        type: s.type,
                        condition: s.condition
                    }))
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
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h1 style={{ marginBottom: 'var(--space-lg)' }}>Create Funnel</h1>

            <form onSubmit={handleSubmit}>
                {/* Basic Info */}
                <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                    <h3 style={{ marginBottom: 'var(--space-md)' }}>Funnel Details</h3>

                    {error && (
                        <div style={{
                            padding: 'var(--space-md)',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid var(--color-error)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--color-error)',
                            fontSize: '0.875rem',
                            marginBottom: 'var(--space-lg)'
                        }}>
                            {error}
                        </div>
                    )}

                    <div style={{ marginBottom: 'var(--space-md)' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: 'var(--space-xs)',
                            fontSize: '0.875rem',
                            color: 'var(--color-text-secondary)'
                        }}>
                            Funnel Name *
                        </label>
                        <input
                            type="text"
                            className="input"
                            placeholder="e.g., Signup Flow"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>

                    <div>
                        <label style={{
                            display: 'block',
                            marginBottom: 'var(--space-xs)',
                            fontSize: '0.875rem',
                            color: 'var(--color-text-secondary)'
                        }}>
                            Description
                        </label>
                        <input
                            type="text"
                            className="input"
                            placeholder="What does this funnel track?"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                </div>

                {/* Funnel Steps */}
                <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-lg)' }}>
                        <h3>Funnel Steps</h3>
                        <button
                            type="button"
                            onClick={addStep}
                            className="btn btn-secondary"
                            disabled={steps.length >= 10}
                        >
                            <Plus size={16} />
                            Add Step
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                        {steps.map((step, index) => (
                            <div key={step.id}>
                                <div style={{
                                    padding: 'var(--space-md)',
                                    background: 'var(--color-bg-secondary)',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--color-border)'
                                }}>
                                    <div className="flex items-center gap-md" style={{ marginBottom: 'var(--space-md)' }}>
                                        <GripVertical size={16} style={{ color: 'var(--color-text-muted)', cursor: 'grab' }} />
                                        <span style={{
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: 'var(--radius-full)',
                                            background: 'var(--color-accent-gradient)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '0.75rem',
                                            fontWeight: 600
                                        }}>
                                            {index + 1}
                                        </span>
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="Step name"
                                            value={step.name}
                                            onChange={(e) => updateStep(step.id, { name: e.target.value })}
                                            style={{ flex: 1 }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeStep(step.id)}
                                            className="btn btn-ghost"
                                            disabled={steps.length <= 2}
                                            style={{ padding: 'var(--space-xs)' }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-3 gap-md">
                                        {/* Event Type */}
                                        <div>
                                            <label style={{
                                                display: 'block',
                                                marginBottom: 'var(--space-xs)',
                                                fontSize: '0.75rem',
                                                color: 'var(--color-text-muted)'
                                            }}>
                                                Event Type
                                            </label>
                                            <select
                                                className="input"
                                                value={step.type}
                                                onChange={(e) => updateStep(step.id, { type: e.target.value as any })}
                                            >
                                                {stepTypes.map(t => (
                                                    <option key={t.value} value={t.value}>{t.label}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Field */}
                                        <div>
                                            <label style={{
                                                display: 'block',
                                                marginBottom: 'var(--space-xs)',
                                                fontSize: '0.75rem',
                                                color: 'var(--color-text-muted)'
                                            }}>
                                                Field
                                            </label>
                                            <select
                                                className="input"
                                                value={step.condition.field}
                                                onChange={(e) => updateStep(step.id, {
                                                    condition: { ...step.condition, field: e.target.value }
                                                })}
                                            >
                                                {fieldsByType[step.type].map(f => (
                                                    <option key={f} value={f}>{f}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Operator */}
                                        <div>
                                            <label style={{
                                                display: 'block',
                                                marginBottom: 'var(--space-xs)',
                                                fontSize: '0.75rem',
                                                color: 'var(--color-text-muted)'
                                            }}>
                                                Match
                                            </label>
                                            <select
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
                                    </div>

                                    {/* Value */}
                                    <div style={{ marginTop: 'var(--space-md)' }}>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: 'var(--space-xs)',
                                            fontSize: '0.75rem',
                                            color: 'var(--color-text-muted)'
                                        }}>
                                            Value
                                        </label>
                                        <input
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

                                {/* Arrow between steps */}
                                {index < steps.length - 1 && (
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'center',
                                        padding: 'var(--space-sm) 0'
                                    }}>
                                        <ArrowRight size={20} style={{
                                            color: 'var(--color-text-muted)',
                                            transform: 'rotate(90deg)'
                                        }} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Submit */}
                <div className="flex gap-md">
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
                        style={{ flex: 1 }}
                    >
                        {loading ? 'Creating...' : 'Create Funnel'}
                        {!loading && <ArrowRight size={18} />}
                    </button>
                </div>
            </form>
        </div>
    );
}
