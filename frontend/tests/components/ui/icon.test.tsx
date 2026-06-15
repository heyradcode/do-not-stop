import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import Icon from '@components/ui/icon';

// Stand-in glyph so the test does not couple to a specific react-icons export.
const Glyph = ({ size }: { size?: number | string }) => (
    <svg data-testid="glyph" data-size={String(size)} />
);

describe('Icon', () => {
    it('renders the glyph with default tone, glow and decorative aria', () => {
        const { container, getByTestId } = render(<Icon as={Glyph} />);

        const span = container.querySelector('span');
        expect(span).toHaveClass('neon-icon', 'tone-inherit', 'glow-soft');
        expect(span).toHaveAttribute('aria-hidden', 'true');
        expect(span).not.toHaveAttribute('role');
        expect(getByTestId('glyph')).toHaveAttribute('data-size', '1em');
    });

    it('becomes an labelled image when a title is given', () => {
        const { container } = render(<Icon as={Glyph} title="Battle" />);

        const span = container.querySelector('span');
        expect(span).toHaveAttribute('role', 'img');
        expect(span).toHaveAttribute('aria-label', 'Battle');
        expect(span).toHaveAttribute('aria-hidden', 'false');
    });

    it('maps tone and glow to their classes and appends a custom className', () => {
        const { container } = render(
            <Icon as={Glyph} tone="emerald" glow="strong" className="no-gap" />,
        );

        expect(container.querySelector('span')).toHaveClass(
            'tone-emerald',
            'glow-strong',
            'no-gap',
        );
    });

    it('omits the glow class when glow is none', () => {
        const { container } = render(<Icon as={Glyph} glow="none" />);

        const span = container.querySelector('span');
        expect(span).toHaveClass('neon-icon', 'tone-inherit');
        expect(span?.className).not.toMatch(/glow-/);
    });

    it('passes through a custom size', () => {
        const { getByTestId } = render(<Icon as={Glyph} size={24} />);
        expect(getByTestId('glyph')).toHaveAttribute('data-size', '24');
    });
});
