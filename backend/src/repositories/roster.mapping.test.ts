import { describe, expect, it } from 'vitest';
import {
    mapPetWireToRosterPet,
    mapRosterRowToRosterPet,
    type PetRosterRow,
    type PetWire,
} from './roster.mapping';

/**
 * The two roster read paths (indexer-go gRPC cache and Prisma/Postgres) must
 * project to an identical RosterPet, or the read source would silently change
 * the payload clients see. These tests pin that invariant on the v2 field set.
 */

const wire: PetWire = {
    chain: 'evm',
    petId: '42',
    owner: '0xabc',
    name: 'Sparky',
    level: 7,
    rarity: 3,
    dna: '123456789012345',
    winCount: 5,
    lossCount: 2,
    readyAt: '1700000000',
    xp: 250,
    generation: 1,
    parent1Id: '10',
    parent2Id: '11',
    breedCount: 2,
    speciesId: 4,
    spouseId: '99',
    breedReadyAt: '1700000500',
    trainReadyAt: '1700000900',
    asset: '',
};

/** The same pet as Prisma would return it — bigint cooldowns already native. */
const row: PetRosterRow = {
    ...wire,
    readyAt: BigInt(wire.readyAt),
    breedReadyAt: BigInt(wire.breedReadyAt),
    trainReadyAt: BigInt(wire.trainReadyAt),
};

describe('roster projection parity (gRPC vs Prisma)', () => {
    it('maps both read paths to a deeply-equal RosterPet', () => {
        expect(mapPetWireToRosterPet(wire)).toEqual(mapRosterRowToRosterPet(row));
    });

    it('exposes the same field set on both paths', () => {
        expect(Object.keys(mapPetWireToRosterPet(wire)).sort()).toEqual(
            Object.keys(mapRosterRowToRosterPet(row)).sort(),
        );
    });
});

describe('mapPetWireToRosterPet', () => {
    it('coerces the proto string cooldowns to bigint', () => {
        const pet = mapPetWireToRosterPet(wire);
        expect(pet.readyAt).toBe(1700000000n);
        expect(pet.breedReadyAt).toBe(1700000500n);
        expect(pet.trainReadyAt).toBe(1700000900n);
        expect(typeof pet.readyAt).toBe('bigint');
    });

    it('keeps the big-int pet ids as decimal strings (no precision loss)', () => {
        const pet = mapPetWireToRosterPet({ ...wire, spouseId: '18446744073709551615' });
        expect(pet.spouseId).toBe('18446744073709551615');
        expect(pet.parent1Id).toBe('10');
    });
});
