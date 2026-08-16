/**
 * The two derivations `PetCard` and `PetDetailStrip` share.
 *
 * Both had their own copy before, under different names, and they disagreed about a pet that
 * had never fought. That is the kind of divergence a screen test does not catch: each surface
 * passed its own assertions while describing the same pet two ways.
 */

import type { Pet } from '@shared/core';

jest.mock('@shared/core', () => ({
    // The real derivation. Stubbing it would leave this asserting the stub, and the point of
    // the tiles is that a pet reads the same here as on the web client, which reads this too.
    ...jest.requireActual('../../shared/src/utils/ethereum/petCard'),
}));

import { getPetProperties } from '../../shared/src/utils/ethereum/petCard';
import { statTiles, winPercent } from '../src/utils/petStats';

const pet = (over: Partial<Pet> = {}): Pet =>
    ({
        id: '1',
        chain: 'evm',
        name: 'Rex',
        dna: 90210n,
        level: 3,
        rarity: 2,
        winCount: 0,
        lossCount: 0,
        readyAt: 0,
        ...over,
    }) as Pet;

describe('statTiles', () => {
    it('pairs each label with its own stat', async () => {
        // By pair, not by presence. Two of the four stats can hold the same number, so a test
        // that only checks the values appear somewhere passes with two fields swapped.
        const subject = pet();
        const props = getPetProperties(subject);

        expect(statTiles(subject)).toEqual([
            { label: 'STR', value: props.attack },
            { label: 'INT', value: props.intelligence },
            { label: 'DEF', value: props.defense },
            { label: 'VIT', value: props.life },
        ]);
    });

    it('offers no AGI, because nothing in the data model backs one', async () => {
        expect(statTiles(pet()).map((t) => t.label)).not.toContain('AGI');
    });
});

describe('winPercent', () => {
    it('rounds the share of fights won', async () => {
        expect(winPercent(pet({ winCount: 4, lossCount: 1 }))).toBe(80);
        expect(winPercent(pet({ winCount: 1, lossCount: 2 }))).toBe(33);
    });

    it('answers null for a pet that has never fought, not zero', async () => {
        // Zero percent reads as a losing record, and never fighting is not losing. Returning
        // the number and letting each surface decide how to say it is what stopped the card
        // and the strip disagreeing.
        expect(winPercent(pet({ winCount: 0, lossCount: 0 }))).toBeNull();
    });

    it('answers zero for a pet that has only lost', async () => {
        // The case `null` must not swallow: this pet really is at zero percent.
        expect(winPercent(pet({ winCount: 0, lossCount: 3 }))).toBe(0);
    });
});
