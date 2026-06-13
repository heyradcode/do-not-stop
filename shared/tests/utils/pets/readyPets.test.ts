import { describe, expect, it } from 'vitest';
import type { Pet } from '../../../src/types/pet';

import { getReadyPets } from '../../../src/utils/pets/readyPets';

const pet = (id: string, readyAt: number): Pet => ({ id, readyAt } as unknown as Pet);

describe('getReadyPets', () => {
    it('keeps only pets whose cooldown has elapsed, tagged with their id', () => {
        const ready = pet('ready', 0);
        const onCooldown = pet('cooldown', Math.floor(Date.now() / 1000) + 10_000);

        const result = getReadyPets([ready, onCooldown]);

        expect(result).toEqual([{ id: 'ready', pet: ready }]);
    });

    it('returns an empty array when nothing is ready', () => {
        const future = Math.floor(Date.now() / 1000) + 10_000;
        expect(getReadyPets([pet('a', future), pet('b', future)])).toEqual([]);
    });
});
