import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Pet } from '@shared/core';

vi.mock('@shared/core', () => ({
    getPetAvatar: (dna: unknown) => `avatar:${dna}`,
    getRarityColor: () => 'rgb(1, 2, 3)',
    getRarityName: (rarity: unknown) => `rarity:${rarity}`,
}));

import FighterPickerCard from '@components/pet/interactions/panels/battle/parts/fighter-picker-card';

const pet = (over: Partial<Pet> = {}): Pet =>
    ({
        id: 'p1',
        name: 'Sparky',
        level: 4,
        dna: 7,
        rarity: 'rare',
        winCount: 3,
        lossCount: 1,
        ...over,
    }) as unknown as Pet;

describe('FighterPickerCard', () => {
    it('renders the pet identity, rarity and win/loss record', () => {
        render(<FighterPickerCard pet={pet()} petId="p1" selected={false} onSelect={vi.fn()} />);

        expect(screen.getByText('Sparky')).toBeInTheDocument();
        expect(screen.getByText('Lv.4')).toBeInTheDocument();
        expect(screen.getByText('avatar:7')).toBeInTheDocument();
        expect(screen.getByText('rarity:rare')).toBeInTheDocument();
        expect(screen.getByText('3W / 1L')).toBeInTheDocument();
    });

    it('reflects the selected state via class and aria-pressed', () => {
        render(<FighterPickerCard pet={pet()} petId="p1" selected onSelect={vi.fn()} />);

        const btn = screen.getByRole('button');
        expect(btn).toHaveClass('is-selected');
        expect(btn).toHaveAttribute('aria-pressed', 'true');
    });

    it('calls onSelect with the pet id on click', async () => {
        const onSelect = vi.fn();
        render(<FighterPickerCard pet={pet()} petId="p1" selected={false} onSelect={onSelect} />);

        await userEvent.click(screen.getByRole('button'));
        expect(onSelect).toHaveBeenCalledWith('p1');
    });
});
