import { describe, it, expect } from 'vitest';
import { mapSolanaPet, type SolanaPetAccountRow } from '../../../src/utils/pets/mapSolanaPet';

// Minimal BN-like stand-in: only toString() is consulted by the mapper.
const bn = (v: string | number) => ({ toString: () => String(v) });

const encodeName = (name: string): number[] => Array.from(new TextEncoder().encode(name));

const row = (account: Record<string, unknown>): SolanaPetAccountRow => ({
    publicKey: { toBase58: () => 'PubKey111' },
    account,
});

describe('mapSolanaPet', () => {
    it('maps a Solana account row into the normalized Pet shape', () => {
        const nameBytes = encodeName('Luna');
        const pet = mapSolanaPet(
            row({
                id: 12,
                name: nameBytes,
                nameLen: nameBytes.length,
                dna: bn('9007199254740993'), // > Number.MAX_SAFE_INTEGER, must stay exact as bigint
                level: 2,
                rarity: 3,
                winCount: 8,
                lossCount: 4,
                readyTime: 1_700_000_000,
            }),
        );
        expect(pet).toMatchObject({
            id: '12',
            chain: 'solana',
            name: 'Luna',
            dna: 9007199254740993n,
            level: 2,
            rarity: 3,
            winCount: 8,
            lossCount: 4,
            readyAt: 1_700_000_000,
        });
    });

    it('decodes a name from a Uint8Array', () => {
        const bytes = new TextEncoder().encode('Ziggy');
        const pet = mapSolanaPet(row({ name: bytes, nameLen: bytes.length }));
        expect(pet.name).toBe('Ziggy');
    });

    it('truncates the name to nameLen', () => {
        const bytes = encodeName('LongName');
        const pet = mapSolanaPet(row({ name: bytes, nameLen: 4 }));
        expect(pet.name).toBe('Long');
    });

    it('returns an empty name when nameLen is zero or missing', () => {
        expect(mapSolanaPet(row({ name: encodeName('Hidden'), nameLen: 0 })).name).toBe('');
        expect(mapSolanaPet(row({ name: encodeName('Hidden') })).name).toBe('');
    });

    it('coerces BN-like and string numeric fields', () => {
        const pet = mapSolanaPet(
            row({
                id: bn(5),
                dna: '255',
                level: bn(7),
                rarity: '4',
                winCount: bn(1),
                lossCount: '0',
                readyTime: bn(1234),
            }),
        );
        expect(pet.id).toBe('5');
        expect(pet.dna).toBe(255n);
        expect(pet.level).toBe(7);
        expect(pet.rarity).toBe(4);
        expect(pet.readyAt).toBe(1234);
    });

    it('maps v2 fields: xp, generation, speciesId, breedCount, breedReadyAt, trainReadyAt', () => {
        const pet = mapSolanaPet(
            row({
                xp: 42,
                generation: 2,
                speciesId: 5,
                breedCount: 3,
                breedReadyTime: 1_700_001_000,
                trainReadyTime: 1_700_002_000,
            }),
        );
        expect(pet.xp).toBe(42);
        expect(pet.generation).toBe(2);
        expect(pet.speciesId).toBe(5);
        expect(pet.breedCount).toBe(3);
        expect(pet.breedReadyAt).toBe(1_700_001_000);
        expect(pet.trainReadyAt).toBe(1_700_002_000);
    });

    it('omits xp, speciesId, breedReadyAt, trainReadyAt when zero/missing', () => {
        const pet = mapSolanaPet(row({ xp: 0, speciesId: 0, breedReadyTime: 0, trainReadyTime: 0 }));
        expect(pet.xp).toBeUndefined();
        expect(pet.speciesId).toBeUndefined();
        expect(pet.breedReadyAt).toBeUndefined();
        expect(pet.trainReadyAt).toBeUndefined();
    });

    it('maps generation=0 (gen-0 starter)', () => {
        const pet = mapSolanaPet(row({ generation: 0 }));
        expect(pet.generation).toBe(0);
    });

    it('defaults missing numeric fields to 0 / 0n', () => {
        const pet = mapSolanaPet(row({}));
        expect(pet.id).toBe('0');
        expect(pet.dna).toBe(0n);
        expect(pet.level).toBe(0);
        expect(pet.winCount).toBe(0);
        expect(pet.readyAt).toBe(0);
        expect(pet.name).toBe('');
    });

});
