import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import DashboardPanel from '@components/common/dashboard-panel';

describe('DashboardPanel', () => {
    it('renders the title with the default heading id wired to aria-labelledby', () => {
        const { container } = render(<DashboardPanel title="My Panel" />);

        const heading = screen.getByRole('heading', { name: 'My Panel' });
        expect(heading).toHaveAttribute('id', 'dashboard-panel-heading');
        expect(container.querySelector('.dashboard-panel')).toHaveAttribute(
            'aria-labelledby',
            'dashboard-panel-heading',
        );
    });

    it('shows the description under the title by default', () => {
        const { container } = render(
            <DashboardPanel title="T" description="Connect your wallet" />,
        );

        const caption = container.querySelector('.intro .caption');
        expect(caption).toHaveTextContent('Connect your wallet');
        expect(container.querySelector('.state-body')).toBeNull();
    });

    it('centers the description and hides the body when centerDescription is set', () => {
        const { container } = render(
            <DashboardPanel title="T" description="Empty" centerDescription>
                <span>child content</span>
            </DashboardPanel>,
        );

        expect(container.querySelector('.state-body .caption')).toHaveTextContent('Empty');
        expect(container.querySelector('.intro .caption')).toBeNull();
        expect(container.querySelector('.panel-body')).toBeNull();
        expect(screen.queryByText('child content')).not.toBeInTheDocument();
    });

    it('renders children in the panel body and an actions slot', () => {
        const { container } = render(
            <DashboardPanel title="T" actions={<button>Refresh</button>}>
                <span>child content</span>
            </DashboardPanel>,
        );

        expect(container.querySelector('.panel-body')).toHaveTextContent('child content');
        expect(container.querySelector('.actions')).toHaveTextContent('Refresh');
    });

    it('applies a custom className and heading id', () => {
        const { container } = render(
            <DashboardPanel title="T" className="pet-collection" headingId="pets" />,
        );

        const section = container.querySelector('.dashboard-panel');
        expect(section).toHaveClass('pet-collection');
        expect(section).toHaveAttribute('aria-labelledby', 'pets');
        expect(screen.getByRole('heading', { name: 'T' })).toHaveAttribute('id', 'pets');
    });
});
