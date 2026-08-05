import { describe, expect, it } from 'vitest';
import type { OnChainPet } from './chain.js';
import { buildPetMetadata } from './metadata.js';

const PET: OnChainPet = {
    tokenId: '7',
    name: 'Sparky',
    dna: 79_34_05_61_88_13_42_07n,
    rarity: 3,
    speciesId: 6,
    level: 4,
    generation: 1,
    winCount: 3,
    lossCount: 1,
};

const OPTIONS = { imageUrl: 'https://art.example/image/evm/7.png' };

describe('buildPetMetadata', () => {
    it('names an unnamed pet after its id rather than emitting an empty name', () => {
        expect(buildPetMetadata({ ...PET, name: '' }, OPTIONS).name).toBe('Pet #7');
    });

    it('uses the pet name when it has one', () => {
        expect(buildPetMetadata(PET, OPTIONS).name).toBe('Sparky');
    });

    it('works for a base58 identifier, so Solana pets get a usable name', () => {
        const asset = 'So11111111111111111111111111111111111111112';
        expect(buildPetMetadata({ ...PET, tokenId: asset, name: '' }, OPTIONS).name).toBe(`Pet #${asset}`);
    });

    // Level and record change as a pet is played; the visual traits never do.
    // Both live in one document, but only the visual half feeds the image key.
    it('lists visual traits and progress separately, with progress typed as numbers', () => {
        const attributes = buildPetMetadata(PET, OPTIONS).attributes;

        expect(attributes.filter((a) => a.display_type === undefined).map((a) => a.trait_type)).toEqual([
            'Element', 'Body', 'Pattern', 'Eyes', 'Marking', 'Rarity',
        ]);
        expect(attributes.filter((a) => a.display_type === 'number')).toEqual([
            { trait_type: 'Level', value: 4, display_type: 'number' },
            { trait_type: 'Generation', value: 1, display_type: 'number' },
            { trait_type: 'Wins', value: 3, display_type: 'number' },
            { trait_type: 'Losses', value: 1, display_type: 'number' },
        ]);
    });

    it('derives the body from DNA when the chain assigns no species', () => {
        // Omitted, not set to undefined: exactOptionalPropertyTypes distinguishes
        // the two, and so does the art derivation.
        const { speciesId: _omitted, ...speciesless } = PET;
        const withSpecies = buildPetMetadata(PET, OPTIONS);
        const withoutSpecies = buildPetMetadata(speciesless, OPTIONS);

        expect(withSpecies.attributes.find((a) => a.trait_type === 'Body')?.value).toBe('Phoenix');
        // speciesId 6 -> Phoenix; DNA pair 6 (34 % 8 = 2) -> Sleek.
        expect(withoutSpecies.attributes.find((a) => a.trait_type === 'Body')?.value).toBe('Sleek');
    });

    it('omits external_url rather than emitting an empty link', () => {
        expect(buildPetMetadata(PET, OPTIONS).external_url).toBeUndefined();
        expect(buildPetMetadata(PET, { ...OPTIONS, externalUrl: 'https://game.example/7' }).external_url)
            .toBe('https://game.example/7');
    });

    it('describes the pet in one sentence for the description field', () => {
        expect(buildPetMetadata(PET, OPTIONS).description).toBe(
            'Rare Water Phoenix with dappled gradient coat, blazing eyes, and a cheeks marking.',
        );
    });
});
