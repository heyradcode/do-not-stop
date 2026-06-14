import { describe, it, expect } from 'vitest';
import { getReadyPets } from '../../../src/utils/ethereum/readyPets';
import type { Pet } from '../../../src/hooks/chains/ethereum/usePetsContract';

const makePet = (readyTime: bigint): Pet => ({ readyTime }) as Pet;

describe('getReadyPets', () => {
    it('returns only pets whose readyTime passes the predicate, paired with their id', () => {
        const ids = [1n, 2n, 3n];
        const pets = [makePet(100n), makePet(200n), makePet(300n)];
        const isReady = (t: bigint) => t >= 200n;

        const result = getReadyPets(ids, pets, isReady);

        expect(result).toEqual([
            { id: 2n, pet: pets[1] },
            { id: 3n, pet: pets[2] },
        ]);
    });

    it('returns an empty array when nothing is ready', () => {
        const ids = [1n, 2n];
        const pets = [makePet(100n), makePet(150n)];
        expect(getReadyPets(ids, pets, () => false)).toEqual([]);
    });

    it('skips ids that have no matching pet entry (undefined)', () => {
        const ids = [1n, 2n];
        const pets = [makePet(100n)]; // pets[1] is undefined
        const result = getReadyPets(ids, pets, () => true);
        expect(result).toEqual([{ id: 1n, pet: pets[0] }]);
    });

    it('returns an empty array for empty inputs', () => {
        expect(getReadyPets([], [], () => true)).toEqual([]);
    });
});
