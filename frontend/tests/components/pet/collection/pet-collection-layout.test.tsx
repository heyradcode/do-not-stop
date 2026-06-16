import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import PetCollectionLayout from '@components/pet/collection/pet-collection-layout';

describe('PetCollectionLayout', () => {
    it('composes the pet-collection panel with its heading id', () => {
        const { container } = render(<PetCollectionLayout title="My Pets" />);

        const heading = screen.getByRole('heading', { name: 'My Pets' });
        expect(heading).toHaveAttribute('id', 'pet-collection-heading');
        expect(container.querySelector('.dashboard-panel')).toHaveClass('pet-collection');
    });

    it('renders description, actions and children by default', () => {
        const { container } = render(
            <PetCollectionLayout title="T" description="desc" actions={<button>Refresh</button>}>
                <span>list content</span>
            </PetCollectionLayout>,
        );

        expect(container.querySelector('.caption')).toHaveTextContent('desc');
        expect(container.querySelector('.actions')).toHaveTextContent('Refresh');
        expect(screen.getByText('list content')).toBeInTheDocument();
    });

    it('centers the description and hides the body when wallet-disconnected', () => {
        const { container } = render(
            <PetCollectionLayout title="T" description="Connect" className="wallet-disconnected">
                <span>list content</span>
            </PetCollectionLayout>,
        );

        expect(container.querySelector('.dashboard-panel')).toHaveClass('pet-collection', 'wallet-disconnected');
        expect(container.querySelector('.state-body .caption')).toHaveTextContent('Connect');
        expect(screen.queryByText('list content')).not.toBeInTheDocument();
    });
});
