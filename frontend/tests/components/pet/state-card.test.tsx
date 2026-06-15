import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import StateCard from '@components/pet/interactions/state-card';

describe('StateCard', () => {
    it('composes the pet-interactions panel with a heading', () => {
        const { container } = render(<StateCard title="No pets yet" />);

        const heading = screen.getByRole('heading', { name: 'No pets yet' });
        expect(heading).toHaveAttribute('id', 'pet-interactions-heading');
        expect(container.querySelector('.dashboard-panel')).toHaveClass('pet-interactions');
    });

    it('renders description, sub, help text and children in the body by default', () => {
        const { container } = render(
            <StateCard title="T" description="desc" sub="sub line" helpText="help line">
                <button>action</button>
            </StateCard>,
        );

        expect(container.querySelector('.description')).toHaveTextContent('desc');
        expect(container.querySelector('.sub')).toHaveTextContent('sub line');
        expect(container.querySelector('.help-text')).toHaveTextContent('help line');
        expect(screen.getByRole('button', { name: 'action' })).toBeInTheDocument();
    });

    it('centers the description and drops the body when wallet is disconnected', () => {
        const { container } = render(
            <StateCard
                title="Connect wallet"
                description="Please connect"
                sub="sub line"
                containerClassName="wallet-disconnected"
            >
                <button>action</button>
            </StateCard>,
        );

        const panel = container.querySelector('.dashboard-panel');
        expect(panel).toHaveClass('pet-interactions', 'wallet-disconnected');
        // Description is rendered by the centered panel slot, not the inline body.
        expect(container.querySelector('.state-body .caption')).toHaveTextContent('Please connect');
        expect(container.querySelector('.description')).toBeNull();
        expect(container.querySelector('.sub')).toBeNull();
        expect(screen.queryByRole('button', { name: 'action' })).not.toBeInTheDocument();
    });
});
