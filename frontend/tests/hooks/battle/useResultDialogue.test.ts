import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import type { BattlePersonas, OpponentPet, Pet } from '@shared/core';

const useBattleDialogue = vi.fn();
vi.mock('@shared/core', async () => {
    // toDialoguePet stays real: several cases assert on the persona the hook builds.
    // Imported from its own module rather than the barrel, which would pull in wagmi and
    // the rest of what this factory exists to replace.
    const persona = await import('../../../../shared/src/utils/battleDialoguePet');
    return {
        ...persona,
        useBattleDialogue: (...args: unknown[]) => useBattleDialogue(...args),
    };
});

import { useResultDialogue } from '@hooks/battle/useResultDialogue';

const pet = (name: string, over: Partial<Pet> = {}): Pet =>
    ({ id: name, name, level: 1, rarity: 'common', dna: 1, winCount: 0, lossCount: 0, ...over }) as Pet;

const noPersonas: React.MutableRefObject<BattlePersonas | null> = { current: null };

type Args = Parameters<typeof useResultDialogue>[0];
const baseArgs = (over: Partial<Args> = {}): Args => ({
    activeChainKind: 'evm',
    settledBattleId: 'tx1',
    selectedFighter: pet('Hero'),
    opponent: pet('Villain') as unknown as OpponentPet,
    personasRef: noPersonas,
    battleOutcome: { result: 'victory', leveledUp: false },
    showResult: true,
    ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    useBattleDialogue.mockReturnValue({ turns: [], isLoading: false, isFetched: false });
});

describe('useResultDialogue', () => {
    it('keeps only result-phase turns', () => {
        useBattleDialogue.mockReturnValue({
            turns: [
                { phase: 'taunt', text: 'grr' },
                { phase: 'result', text: 'gg' },
            ],
            isLoading: false,
            isFetched: true,
        });

        const { result } = renderHook(() => useResultDialogue(baseArgs()));

        expect(result.current.resultTurns).toEqual([{ phase: 'result', text: 'gg' }]);
    });

    it('derives the dialogue winner from the outcome', () => {
        renderHook(() => useResultDialogue(baseArgs({ battleOutcome: { result: 'defeat', leveledUp: true } })));

        expect(useBattleDialogue).toHaveBeenLastCalledWith(
            expect.objectContaining({ winner: 'defender', leveledUp: true, enabled: true }),
        );
    });

    it('disables the query until there is an outcome', () => {
        renderHook(() => useResultDialogue(baseArgs({ battleOutcome: null })));

        expect(useBattleDialogue).toHaveBeenLastCalledWith(
            expect.objectContaining({ winner: null, enabled: false }),
        );
    });

    it('marks done when the query settled with nothing to play', () => {
        useBattleDialogue.mockReturnValue({ turns: [], isLoading: false, isFetched: true });

        const { result } = renderHook(() => useResultDialogue(baseArgs()));

        expect(result.current.resultDialogueDone).toBe(true);
    });

    it('marks done when there is no battle id to fetch', () => {
        useBattleDialogue.mockReturnValue({ turns: [], isLoading: false, isFetched: false });

        const { result } = renderHook(() => useResultDialogue(baseArgs({ settledBattleId: null })));

        expect(result.current.resultDialogueDone).toBe(true);
    });

    it('stays gated while result dialogue is still to play, then unblocks on demand', () => {
        useBattleDialogue.mockReturnValue({
            turns: [{ phase: 'result', text: 'gg' }],
            isLoading: false,
            isFetched: true,
        });

        const { result } = renderHook(() => useResultDialogue(baseArgs()));
        expect(result.current.resultDialogueDone).toBe(false);

        act(() => {
            result.current.markResultDialogueDone();
        });
        expect(result.current.resultDialogueDone).toBe(true);

        act(() => {
            result.current.resetResultDialogue();
        });
        expect(result.current.resultDialogueDone).toBe(false);
    });

    it('falls back to captured personas when the fighter has dropped out', () => {
        const personasRef: React.MutableRefObject<BattlePersonas | null> = {
            current: {
                attacker: { petId: 'a', name: 'Captured Hero', level: 1, rarity: 'common', dna: '1', winCount: 0, lossCount: 0 },
                defender: { petId: 'd', name: 'Captured Foe', level: 1, rarity: 'common', dna: '1', winCount: 0, lossCount: 0 },
            },
        };

        const { result } = renderHook(() =>
            useResultDialogue(baseArgs({ selectedFighter: null, opponent: undefined, personasRef })),
        );

        expect(result.current.attackerName).toBe('Captured Hero');
        expect(result.current.defenderName).toBe('Captured Foe');
    });

    it('uses default names when nothing is available', () => {
        const { result } = renderHook(() =>
            useResultDialogue(baseArgs({ selectedFighter: null, opponent: undefined })),
        );

        expect(result.current.attackerName).toBe('Your pet');
        expect(result.current.defenderName).toBe('Opponent');
    });
});
