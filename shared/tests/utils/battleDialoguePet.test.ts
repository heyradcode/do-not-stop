import { describe, expect, it } from 'vitest';
import type { OpponentPet, Pet } from '../../src/types/pet';

import { toDialoguePet } from '../../src/utils/battleDialoguePet';

describe('toDialoguePet', () => {
    it('maps a pet to the dialogue persona shape and stringifies dna', () => {
        const pet = {
            id: 'p1',
            name: 'Sparky',
            level: 3,
            rarity: 'rare',
            dna: 42,
            winCount: 5,
            lossCount: 2,
        } as unknown as Pet;

        expect(toDialoguePet(pet)).toEqual({
            petId: 'p1',
            name: 'Sparky',
            level: 3,
            rarity: 'rare',
            dna: '42',
            winCount: 5,
            lossCount: 2,
        });
    });

    it('works for an opponent pet too', () => {
        const opp = {
            id: 'o1',
            name: 'Rival',
            level: 9,
            rarity: 'legendary',
            dna: 7,
            winCount: 1,
            lossCount: 0,
        } as unknown as OpponentPet;

        expect(toDialoguePet(opp).petId).toBe('o1');
        expect(toDialoguePet(opp).dna).toBe('7');
    });
});
