import { describe, it, expect } from 'vitest';
import { mapEvmPet, type EvmRawPet } from '../../../src/utils/pets/mapEvmPet';

const raw: EvmRawPet = {
    name: 'Sparky',
    dna: 1234567890123456789n,
    level: 3,
    readyTime: 1_700_000_000n,
    winCount: 5,
    lossCount: 2,
    rarity: 4,
};

describe('mapEvmPet', () => {
    it('maps a raw EVM pet into the normalized Pet shape', () => {
        const pet = mapEvmPet(raw, 7n);
        expect(pet).toEqual({
            id: '7',
            chain: 'evm',
            name: 'Sparky',
            dna: 1234567890123456789n,
            level: 3,
            rarity: 4,
            winCount: 5,
            lossCount: 2,
            readyAt: 1_700_000_000,
        });
    });

    it('stringifies the tokenId and keeps dna as a bigint', () => {
        const pet = mapEvmPet(raw, 42n);
        expect(pet.id).toBe('42');
        expect(typeof pet.id).toBe('string');
        expect(typeof pet.dna).toBe('bigint');
    });

    it('coerces bigint-valued numeric fields to numbers', () => {
        const pet = mapEvmPet(
            { ...raw, level: 9n, winCount: 100n, lossCount: 1n, rarity: 5n },
            1n,
        );
        expect(pet.level).toBe(9);
        expect(pet.winCount).toBe(100);
        expect(pet.lossCount).toBe(1);
        expect(pet.rarity).toBe(5);
        expect(typeof pet.level).toBe('number');
    });
});
