// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Pet } from '@shared/core';

vi.mock('@shared/core', () => ({
    getPetAvatar: () => '🐉',
    // No art service here: PetArt renders the emoji alone.
    petArtUrl: () => null,
}));

import PetSelect from '@components/ui/pet-select';

const pet = (id: string, name: string, level: number) => ({
    id,
    pet: { id, name, level, dna: 1n, rarity: 0 } as unknown as Pet,
});

const pets = [pet('1', 'Alpha', 2), pet('2', 'Beta', 5), pet('3', 'Gamma', 7)];

describe('PetSelect', () => {
    it('opens on the trigger and reports the chosen pet', async () => {
        const onChange = vi.fn();
        render(<PetSelect pets={pets} value="" onChange={onChange} label="Pick a pet" />);

        const trigger = screen.getByRole('combobox', { name: 'Pick a pet' });
        expect(screen.queryByRole('listbox')).toBeNull();

        await userEvent.click(trigger);
        await userEvent.click(await screen.findByRole('option', { name: /Beta/ }));

        expect(onChange).toHaveBeenCalledWith('2');
        // Choosing closes it, so the player is not left with a menu over the panel.
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    /**
     * The popup is fixed to a rect measured once, so a scrolled page would leave it
     * floating beside nothing — it closes instead. Its own list is the exception: the
     * capture listener sees that scroll too, and closing on it made a long pet list
     * impossible to scroll through.
     */
    it('stays open while its own list is scrolled, and closes when the page scrolls', async () => {
        render(<PetSelect pets={pets} value="" onChange={vi.fn()} label="Pick a pet" />);
        await userEvent.click(screen.getByRole('combobox'));

        const listbox = await screen.findByRole('listbox');
        fireEvent.scroll(listbox);
        expect(screen.getByRole('listbox')).toBeInTheDocument();

        fireEvent.scroll(document);
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('closes on Escape and when the pointer lands outside', async () => {
        render(<PetSelect pets={pets} value="" onChange={vi.fn()} label="Pick a pet" />);

        await userEvent.click(screen.getByRole('combobox'));
        await userEvent.keyboard('{Escape}');
        expect(screen.queryByRole('listbox')).toBeNull();

        await userEvent.click(screen.getByRole('combobox'));
        expect(await screen.findByRole('listbox')).toBeInTheDocument();
        await userEvent.click(document.body);
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('shows the placeholder until a pet is chosen', () => {
        const { rerender } = render(
            <PetSelect pets={pets} value="" onChange={vi.fn()} placeholder="Choose…" />,
        );
        expect(screen.getByText('Choose…')).toBeInTheDocument();

        rerender(<PetSelect pets={pets} value="3" onChange={vi.fn()} placeholder="Choose…" />);
        expect(screen.queryByText('Choose…')).toBeNull();
        expect(screen.getByText('Gamma')).toBeInTheDocument();
        expect(screen.getByText('Lv 7')).toBeInTheDocument();
    });
});
