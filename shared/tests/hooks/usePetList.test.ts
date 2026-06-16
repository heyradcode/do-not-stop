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

import { usePetList } from '../../src/hooks/usePetList';

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
});
