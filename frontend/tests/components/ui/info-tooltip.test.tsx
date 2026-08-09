import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import InfoTooltip from '@components/ui/info-tooltip';

const open = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'What does Iron Fang do?' }));
};

const renderTooltip = () =>
    render(
        <InfoTooltip subject="Iron Fang">
            <p>Adds +4 ATK for the whole battle.</p>
        </InfoTooltip>,
    );

describe('InfoTooltip', () => {
    it('starts closed', () => {
        renderTooltip();
        expect(screen.queryByText(/Adds \+4 ATK/)).not.toBeInTheDocument();
        expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    });

    it('opens on click and announces itself as expanded', async () => {
        renderTooltip();
        await open();
        expect(screen.getByText(/Adds \+4 ATK/)).toBeInTheDocument();
        expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    });

    it('names what it explains, since the trigger is a bare "?"', () => {
        renderTooltip();
        expect(screen.getByRole('button', { name: 'What does Iron Fang do?' })).toBeInTheDocument();
    });

    // A typographic question mark, not a drawn one: at this size the typeface's own glyph is
    // sharper than any icon path. Hidden from assistive tech because the button's label
    // already says what it does, so announcing "question mark" would only add noise.
    it('draws the mark as text rather than an icon', () => {
        renderTooltip();
        const glyph = screen.getByRole('button').querySelector('span');
        expect(glyph).toHaveTextContent('?');
        expect(glyph).toHaveAttribute('aria-hidden', 'true');
        expect(screen.getByRole('button').querySelector('svg')).toBeNull();
    });

    it('toggles shut on a second click', async () => {
        renderTooltip();
        await open();
        await open();
        expect(screen.queryByText(/Adds \+4 ATK/)).not.toBeInTheDocument();
    });

    // Escape without returning focus leaves a keyboard user at the top of the document,
    // having dismissed something they cannot see.
    it('closes on Escape and puts focus back on the trigger', async () => {
        renderTooltip();
        await open();

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(screen.queryByText(/Adds \+4 ATK/)).not.toBeInTheDocument();
        expect(screen.getByRole('button')).toHaveFocus();
    });

    it('closes when something else is clicked', async () => {
        renderTooltip();
        await open();

        fireEvent.pointerDown(document.body);

        expect(screen.queryByText(/Adds \+4 ATK/)).not.toBeInTheDocument();
    });

    it('stays open when the panel itself is clicked, so the text can be selected', async () => {
        renderTooltip();
        await open();

        fireEvent.pointerDown(screen.getByText(/Adds \+4 ATK/));

        expect(screen.getByText(/Adds \+4 ATK/)).toBeInTheDocument();
    });

    /**
     * The panel is positioned once from the trigger's rect, so it would drift away from its
     * button as the page moves. Closing is the honest answer for something whose lifetime is
     * "read it, dismiss it"; the bag's own scrolling region is why the listener is capturing.
     */
    it('closes on scroll rather than drifting away from its button', async () => {
        renderTooltip();
        await open();

        fireEvent.scroll(document, {});

        expect(screen.queryByText(/Adds \+4 ATK/)).not.toBeInTheDocument();
    });

    /**
     * The item card sets `overflow: hidden` for its rarity stripe, so a panel rendered in
     * place would be clipped to the card and mostly invisible.
     */
    it('renders the panel outside its parent, so a clipping ancestor cannot hide it', async () => {
        const { container } = render(
            <div style={{ overflow: 'hidden' }}>
                <InfoTooltip subject="Iron Fang">
                    <p>Adds +4 ATK for the whole battle.</p>
                </InfoTooltip>
            </div>,
        );
        await open();

        const panel = screen.getByText(/Adds \+4 ATK/);
        expect(container.contains(panel)).toBe(false);
        expect(document.body.contains(panel)).toBe(true);
    });

    it('links the trigger to the panel it controls', async () => {
        renderTooltip();
        await open();

        const controls = screen.getByRole('button').getAttribute('aria-controls');
        expect(controls).toBeTruthy();
        expect(document.getElementById(controls!)).toContainElement(screen.getByText(/Adds \+4 ATK/));
    });
});
