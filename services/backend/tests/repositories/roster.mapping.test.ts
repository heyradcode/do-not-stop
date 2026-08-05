import { describe, expect, it } from 'vitest';
import { mapPetWireToRosterPet, mapRosterRowToRosterPet } from '../../src/repositories/roster.mapping';
import type { PetWire, PetRosterRow } from '../../src/repositories/roster.mapping';

const wire: PetWire = {
    chain: 'evm', petId: '1', owner: '0xowner', name: 'Rex',
    level: 5, rarity: 1, dna: '0xdna', winCount: 3, lossCount: 1,
    readyAt: '1000', xp: 100, generation: 1,
    parent1Id: '0', parent2Id: '0', breedCount: 0, speciesId: 1,
    spouseId: '0', breedReadyAt: '2000', trainReadyAt: '3000', asset: '',
};

const row: PetRosterRow = {
    chain: 'evm', petId: '1', owner: '0xowner', name: 'Rex',
    level: 5, rarity: 1, dna: '0xdna', winCount: 3, lossCount: 1,
    readyAt: 1000n, xp: 100, generation: 1,
    parent1Id: '0', parent2Id: '0', breedCount: 0, speciesId: 1,
    spouseId: '0', breedReadyAt: 2000n, trainReadyAt: 3000n, asset: '',
};

describe('mapPetWireToRosterPet', () => {
    it('converts string cooldowns to bigints', () => {
        const pet = mapPetWireToRosterPet(wire);
        expect(pet.readyAt).toBe(1000n);
        expect(pet.breedReadyAt).toBe(2000n);
        expect(pet.trainReadyAt).toBe(3000n);
    });

    it('preserves scalar fields unchanged', () => {
        const pet = mapPetWireToRosterPet(wire);
        expect(pet.petId).toBe('1');
        expect(pet.name).toBe('Rex');
        expect(pet.level).toBe(5);
        expect(pet.xp).toBe(100);
    });

    it('casts chain string to Chain type', () => {
        const pet = mapPetWireToRosterPet(wire);
        expect(pet.chain).toBe('evm');
    });
});

describe('mapRosterRowToRosterPet', () => {
    it('passes bigint cooldowns through unchanged', () => {
        const pet = mapRosterRowToRosterPet(row);
        expect(pet.readyAt).toBe(1000n);
        expect(pet.breedReadyAt).toBe(2000n);
        expect(pet.trainReadyAt).toBe(3000n);
    });

    it('produces an identical shape to mapPetWireToRosterPet for the same data', () => {
        const fromWire = mapPetWireToRosterPet(wire);
        const fromRow = mapRosterRowToRosterPet(row);
        expect(fromWire).toEqual(fromRow);
    });
});
