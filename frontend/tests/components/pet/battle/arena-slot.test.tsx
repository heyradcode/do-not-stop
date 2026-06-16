import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Pet } from '@shared/core';

vi.mock('@shared/core', () => ({
    getPetAvatar: (dna: unknown) => `avatar:${dna}`,
    getLifePercent: () => 50,
}));

import ArenaSlot from '@components/pet/interactions/panels/battle/parts/arena-slot';

const pet = (over: Partial<Pet> = {}): Pet =>
    ({ id: 'p1', name: 'Sparky', level: 3, dna: 7, ...over }) as unknown as Pet;

describe('ArenaSlot', () => {
    it('renders an empty placeholder slot when there is no pet', () => {
        const { container } = render(<ArenaSlot placeholder="Pick a fighter" side="fighter" />);

        const slot = container.querySelector('.arena-slot');
        expect(slot).toHaveClass('is-empty', 'arena-slot-fighter');
        expect(screen.getByText('Pick a fighter')).toBeInTheDocument();
    });

    it('renders the selected pet with avatar, level and life bar', () => {
        const { container } = render(
            <ArenaSlot pet={pet()} placeholder="x" side="opponent" ownerLabel="You" />,
        );

        const slot = container.querySelector('.arena-slot');
        expect(slot).toHaveClass('is-selected', 'arena-slot-opponent');
        expect(screen.getByText('Sparky')).toBeInTheDocument();
        expect(screen.getByText('avatar:7')).toBeInTheDocument();
        expect(screen.getByText('Lv.3 · You')).toBeInTheDocument();
        expect(container.querySelector('.life-fill')).toHaveStyle({ width: '50%' });
    });

    it('omits the owner label when not provided', () => {
        render(<ArenaSlot pet={pet()} placeholder="x" side="fighter" />);
        expect(screen.getByText('Lv.3')).toBeInTheDocument();
    });

    it('adds the flash modifier when flash is set', () => {
        const { container } = render(
            <ArenaSlot pet={pet()} placeholder="x" side="fighter" flash />,
        );
        expect(container.querySelector('.arena-slot')).toHaveClass('is-flash');
    });
});
