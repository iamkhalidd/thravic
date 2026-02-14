import { render, screen } from '@testing-library/react';
import { StatCard } from '../StatCard';
import { describe, it, expect } from 'vitest';

describe('StatCard', () => {
    it('renders label and value correctly', () => {
        render(<StatCard label="Total Users" value="1,234" />);
        expect(screen.getByText('Total Users')).toBeInTheDocument();
        expect(screen.getByText('1,234')).toBeInTheDocument();
    });

    it('renders loading skeleton when loading is true', () => {
        const { container } = render(<StatCard label="Total Users" value="1,234" loading={true} />);
        expect(container.getElementsByClassName('skeleton').length).toBeGreaterThan(0);
    });
});
