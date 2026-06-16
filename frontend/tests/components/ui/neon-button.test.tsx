import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import NeonButton from '@components/ui/neon-button';

describe('NeonButton', () => {
    it('renders its children with default tone, size and type', () => {
        render(<NeonButton>Click me</NeonButton>);

        const btn = screen.getByRole('button', { name: 'Click me' });
        expect(btn).toHaveAttribute('type', 'button');
        expect(btn).toHaveClass('neon-btn', 'tone-azure', 'size-md');
        expect(btn).not.toHaveClass('full-width');
    });

    it('applies tone, size, fullWidth and a custom className', () => {
        render(
            <NeonButton tone="amber" size="sm" fullWidth className="extra">
                X
            </NeonButton>,
        );

        expect(screen.getByRole('button')).toHaveClass(
            'tone-amber',
            'size-sm',
            'full-width',
            'extra',
        );
    });

    it('respects an explicit button type', () => {
        render(<NeonButton type="submit">Submit</NeonButton>);
        expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
    });

    it('forwards onClick and other native props', async () => {
        const onClick = vi.fn();
        render(
            <NeonButton onClick={onClick} aria-label="go">
                Go
            </NeonButton>,
        );

        await userEvent.click(screen.getByLabelText('go'));
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('does not fire onClick while disabled', async () => {
        const onClick = vi.fn();
        render(
            <NeonButton onClick={onClick} disabled>
                Go
            </NeonButton>,
        );

        const btn = screen.getByRole('button');
        expect(btn).toBeDisabled();
        await userEvent.click(btn);
        expect(onClick).not.toHaveBeenCalled();
    });
});
