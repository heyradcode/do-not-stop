import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Pet } from '@shared/core';

import { useBattleOutcome } from '@hooks/battle/useBattleOutcome';

// Minimal Pet — the hook only reads id/winCount/lossCount/level.
const fighter = (over: Partial<Pet> = {}): Pet =>
    ({ id: 'p1', winCount: 0, lossCount: 0, level: 1, ...over }) as Pet;

type Props = { pets: Pet[]; selectedPet1: string; petsLoading: boolean };
const initial: Props = { pets: [fighter()], selectedPet1: 'p1', petsLoading: false };

/** Snapshot the starting stats and arm outcome detection. */
const arm = (result: { current: ReturnType<typeof useBattleOutcome> }) => {
    act(() => {
        result.current.snapshotFighterStats(fighter());
    });
    act(() => {
        result.current.markPendingOutcome();
    });
};

describe('useBattleOutcome', () => {
    it('starts with no outcome', () => {
        const { result } = renderHook((props: Props) => useBattleOutcome(props), {
            initialProps: initial,
        });
        expect(result.current.battleOutcome).toBeNull();
    });

    it('resolves a victory when the win count increases', () => {
        const { result, rerender } = renderHook((props: Props) => useBattleOutcome(props), {
            initialProps: initial,
        });
        arm(result);

        rerender({ ...initial, pets: [fighter({ winCount: 1 })] });

        expect(result.current.battleOutcome).toEqual({ result: 'victory', leveledUp: false });
    });

    it('resolves a defeat when the loss count increases', () => {
        const { result, rerender } = renderHook((props: Props) => useBattleOutcome(props), {
            initialProps: initial,
        });
        arm(result);

        rerender({ ...initial, pets: [fighter({ lossCount: 1 })] });

        expect(result.current.battleOutcome).toEqual({ result: 'defeat', leveledUp: false });
    });

    it('flags a level-up alongside the result', () => {
        const { result, rerender } = renderHook((props: Props) => useBattleOutcome(props), {
            initialProps: initial,
        });
        arm(result);

        rerender({ ...initial, pets: [fighter({ winCount: 1, level: 2 })] });

        expect(result.current.battleOutcome).toEqual({ result: 'victory', leveledUp: true });
    });

    it('waits while the stats have not refreshed yet', () => {
        const { result, rerender } = renderHook((props: Props) => useBattleOutcome(props), {
            initialProps: initial,
        });
        arm(result);

        // Same win/loss as the snapshot — nothing to resolve.
        rerender({ ...initial, pets: [fighter({ level: 2 })] });

        expect(result.current.battleOutcome).toBeNull();
    });

    it('does not resolve while pets are still loading', () => {
        const { result, rerender } = renderHook((props: Props) => useBattleOutcome(props), {
            initialProps: initial,
        });
        arm(result);

        rerender({ ...initial, pets: [fighter({ winCount: 1 })], petsLoading: true });

        expect(result.current.battleOutcome).toBeNull();
    });

    it('clearSnapshot prevents any resolution', () => {
        const { result, rerender } = renderHook((props: Props) => useBattleOutcome(props), {
            initialProps: initial,
        });
        arm(result);
        act(() => {
            result.current.clearSnapshot();
        });

        rerender({ ...initial, pets: [fighter({ winCount: 1 })] });

        expect(result.current.battleOutcome).toBeNull();
    });

    it('resetOutcome clears a resolved outcome', () => {
        const { result, rerender } = renderHook((props: Props) => useBattleOutcome(props), {
            initialProps: initial,
        });
        arm(result);
        rerender({ ...initial, pets: [fighter({ winCount: 1 })] });
        expect(result.current.battleOutcome).not.toBeNull();

        act(() => {
            result.current.resetOutcome();
        });

        expect(result.current.battleOutcome).toBeNull();
    });
});
