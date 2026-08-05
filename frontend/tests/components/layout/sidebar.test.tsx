import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import Sidebar from '@components/layout/sidebar';

const renderSidebar = () =>
    render(
        <MemoryRouter initialEntries={['/']}>
            <Sidebar />
        </MemoryRouter>,
    );

const pinButton = () => screen.getByRole('button', { name: 'Keep sidebar open' });

beforeEach(() => {
    localStorage.clear();
});

describe('Sidebar pin', () => {
    it('starts unpinned, so the rail still collapses by default', () => {
        renderSidebar();
        expect(pinButton()).toHaveAttribute('aria-pressed', 'false');
    });

    it('toggles pinned state on click', async () => {
        renderSidebar();

        await userEvent.click(pinButton());
        expect(pinButton()).toHaveAttribute('aria-pressed', 'true');

        await userEvent.click(pinButton());
        expect(pinButton()).toHaveAttribute('aria-pressed', 'false');
    });

    // A pin that forgets on reload is a pin that does not work: the whole point
    // is not having to re-state the preference.
    it('remembers the pin across a remount', async () => {
        const { unmount } = renderSidebar();
        await userEvent.click(pinButton());
        unmount();

        renderSidebar();
        expect(pinButton()).toHaveAttribute('aria-pressed', 'true');
    });

    it('does not navigate when the pin is clicked', async () => {
        // The pin sits beside the brand button rather than inside it; nesting
        // them would make pinning also jump to the gallery.
        renderSidebar();

        await userEvent.click(pinButton());

        expect(pinButton()).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Crypto Pets home' })).toBeInTheDocument();
    });
});
