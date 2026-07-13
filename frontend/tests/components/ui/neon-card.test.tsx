import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import NeonCard from '@components/ui/neon-card';

describe('NeonCard', () => {
    it('renders an article by default with the card class', () => {
        render(<NeonCard>content</NeonCard>);

        const el = screen.getByText('content');
        expect(el.tagName).toBe('ARTICLE');
        expect(el).toHaveClass('card');
    });

    it('renders a custom tag and merges the className', () => {
        render(
            <NeonCard as="section" className="highlighted">
                body
            </NeonCard>,
        );

        const el = screen.getByText('body');
        expect(el.tagName).toBe('SECTION');
        expect(el).toHaveClass('card', 'highlighted');
    });

    it('forwards native html attributes', () => {
        render(
            <NeonCard data-testid="card" role="region">
                body
            </NeonCard>,
        );

        expect(screen.getByTestId('card')).toHaveAttribute('role', 'region');
    });
});
