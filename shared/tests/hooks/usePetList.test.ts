import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pet } from '../../src/types/pet';

const pets = {
    data: [] as Pet[],
    isLoading: false,
    error: null as Error | null,
    refetch: vi.fn(),
};

vi.mock('../../src/hooks/adapters/useChainAdapter', () => ({
    useChainAdapter: () => ({ pets }),
}));

const activeChain = { kind: 'evm' as 'evm' | 'solana' | 'none' };
vi.mock('../../src/hooks/session/useActiveChain', () => ({
    useActiveChain: () => activeChain,
}));

const useBattleProgress = vi.fn((_chain: unknown, list: Pet[]) => list);
vi.mock('../../src/hooks/battle/useBattleProgress', () => ({
    useBattleProgress: (chain: unknown, list: Pet[]) => useBattleProgress(chain, list),
}));

import { usePetList } from '../../src/hooks/pets/usePetList';

const pet = {
    id: '1',
    name: 'Sparky',
    dna: 42n,
    level: 1,
    rarity: 2,
    experience: 0,
    wins: 0,
    losses: 0,
    cooldownEnd: 0,
    owner: '0xowner',
    chain: 'evm',
} as Pet;

beforeEach(() => {
    pets.data = [];
    pets.isLoading = false;
    pets.error = null;
    pets.refetch = vi.fn();
    activeChain.kind = 'evm';
    useBattleProgress.mockClear();
    useBattleProgress.mockImplementation((_chain, list) => list);
});

describe('usePetList', () => {
    it('returns the active adapter pet list state', () => {
        const error = new Error('failed to load pets');
        pets.data = [pet];
        pets.isLoading = true;
        pets.error = error;

        const result = usePetList();

        expect(result).toEqual({
            pets: [pet],
            isLoading: true,
            error,
            refetch: pets.refetch,
        });
    });

    it('passes refetch through to the active adapter', () => {
        const result = usePetList();

        result.refetch();

        expect(pets.refetch).toHaveBeenCalledOnce();
    });

    it('returns pets with backend progression applied, not the raw chain read', () => {
        // The whole point of the seam: battles no longer move on-chain stats, so what the
        // adapter hands back is stale for any pet that has fought.
        pets.data = [pet];
        const levelled = { ...pet, level: 12, winCount: 25 };
        useBattleProgress.mockReturnValue([levelled]);

        expect(usePetList().pets).toEqual([levelled]);
    });

    it('passes the active chain through so progression is looked up on the right one', () => {
        activeChain.kind = 'solana';
        pets.data = [pet];

        usePetList();

        expect(useBattleProgress).toHaveBeenCalledWith('solana', [pet]);
    });

    it('asks for no progression while disconnected', () => {
        activeChain.kind = 'none';

        usePetList();

        expect(useBattleProgress).toHaveBeenCalledWith(null, []);
    });
});
