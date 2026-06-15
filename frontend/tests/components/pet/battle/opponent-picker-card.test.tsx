import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OpponentPet } from '@shared/core';

vi.mock('@shared/core', () => ({
    getPetAvatar: (dna: unknown) => `avatar:${dna}`,
    getRarityColor: () => 'rgb(1, 2, 3)',
    getRarityName: (rarity: unknown) => `rarity:${rarity}`,
}));

import OpponentPickerCard from '@components/pet/interactions/panels/battle/parts/opponent-picker-card';

const owner = '0x1234567890abcdef';
const opponent = (over: Partial<OpponentPet> = {}): OpponentPet =>
    ({
        id: 'o1',
        owner,
        name: 'Rival',
        level: 5,
        dna: 9,
        rarity: 'epic',
        winCount: 2,
        lossCount: 4,
        ...over,
    }) as unknown as OpponentPet;

describe('OpponentPickerCard', () => {
    it('renders identity, shortened owner and record', () => {
        render(
            <OpponentPickerCard
                opponent={opponent()}
                fighterLevel={null}
                selected={false}
                onSelect={vi.fn()}
            />,
        );

        expect(screen.getByText('Rival')).toBeInTheDocument();
        expect(screen.getByText('Lv.5 · 0x1234…cdef')).toBeInTheDocument();
        expect(screen.getByText('2W / 4L')).toBeInTheDocument();
    });

    it('omits the match tier when there is no fighter level', () => {
        const { container } = render(
            <OpponentPickerCard
                opponent={opponent()}
                fighterLevel={null}
                selected={false}
                onSelect={vi.fn()}
            />,
        );

        expect(container.querySelector('.stat-pill.match-even')).toBeNull();
        expect(container.querySelector('button')?.className).not.toMatch(/match-/);
    });

    it('tags an even match when fighter and opponent levels align', () => {
        const { container } = render(
            <OpponentPickerCard
                opponent={opponent({ level: 5 })}
                fighterLevel={5}
                selected={false}
                onSelect={vi.fn()}
            />,
        );

        expect(container.querySelector('button')).toHaveClass('match-even');
        expect(screen.getByText('Even match')).toHaveClass('stat-pill', 'match-even');
    });

    it('reflects selection and calls onSelect with the opponent key', async () => {
        const onSelect = vi.fn();
        render(
            <OpponentPickerCard
                opponent={opponent()}
                fighterLevel={5}
                selected
                onSelect={onSelect}
            />,
        );

        const btn = screen.getByRole('button');
        expect(btn).toHaveClass('is-selected');
        expect(btn).toHaveAttribute('aria-pressed', 'true');

        await userEvent.click(btn);
        expect(onSelect).toHaveBeenCalledWith(`${owner}::o1`);
    });
});
