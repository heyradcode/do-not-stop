/**
 * Holding a picker chip opens that pet's card.
 *
 * Driven through `PetPicker` rather than `PetPreview` on its own, because the preview is a
 * dumb view over a pet and the part worth pinning is the gesture: that a hold opens it, a tap
 * still selects, and the hold is long enough not to fire while the player is scrolling the
 * chips sideways.
 */

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { Pet } from '@shared/core';

// The barrel drags the Solana runtime into jest; the card reads these helpers for real,
// because what it shows has to be the number the web app shows.
jest.mock('@shared/core', () => ({
    ...jest.requireActual('../../shared/src/utils/ethereum/petCard'),
    ...jest.requireActual('../../shared/src/utils/pets/skills'),
    getRarityColor: () => '#C0C0C0',
    getRarityName: () => 'Uncommon',
    itemArtUrl: () => null,
}));

jest.mock('../src/components/PetArt', () => {
    const { Text: RNText } = jest.requireActual('react-native');
    const React_ = jest.requireActual('react');
    return ({ pet }: { pet: { id: string } }) =>
        React_.createElement(RNText, null, `[art:${pet.id}]`);
});

import PetPicker from '../src/components/PetPicker';

const pet = (over: Partial<Pet> = {}): Pet => ({
    id: '1',
    chain: 'evm',
    name: 'Rex',
    dna: 0n,
    level: 3,
    rarity: 2,
    winCount: 4,
    lossCount: 1,
    readyAt: 0,
    ...over,
});

const onSelect = jest.fn();

const render = async (pets: Pet[]) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <PetPicker
                pets={pets.map((p) => ({ id: p.id, pet: p }))}
                selectedId=""
                onSelect={onSelect}
                emptyHint="none"
            />,
        );
    });
    return tree;
};

/** The chips, in order. The preview's own touchables are not chips. */
const chips = (tree: ReactTestRenderer.ReactTestRenderer) =>
    tree.root.findAllByType(TouchableOpacity);

const textOf = (tree: ReactTestRenderer.ReactTestRenderer): string =>
    tree.root
        .findAllByType(Text)
        .map((n) => {
            const walk = (c: unknown): string =>
                typeof c === 'string' || typeof c === 'number'
                    ? String(c)
                    : Array.isArray(c)
                      ? c.map(walk).join('')
                      : '';
            return walk(n.props.children);
        })
        .join(' | ');

beforeEach(() => jest.clearAllMocks());

describe('holding a pet chip', () => {
    it('opens that pet, with the stats the chip has no room for', async () => {
        const tree = await render([pet()]);
        // The chip alone shows art, a name and a level. None of this is on it.
        expect(textOf(tree)).not.toContain('STR');

        await ReactTestRenderer.act(async () => chips(tree)[0].props.onLongPress());

        const shown = textOf(tree);
        expect(shown).toContain('STR');
        expect(shown).toContain('Uncommon');
        expect(shown).toContain('80% win rate');
    });

    it('opens the pet that was held, not the first one', async () => {
        const tree = await render([pet(), pet({ id: '2', name: 'Momo' })]);
        await ReactTestRenderer.act(async () => chips(tree)[1].props.onLongPress());

        // On `ID #`, which only the card renders. Asserting on the art marker passed against
        // a version that always previewed the first pet, because both chips draw their own
        // art and the marker was in the tree either way.
        const shown = textOf(tree);
        expect(shown).toContain('ID #2');
        expect(shown).not.toContain('ID #1');
    });

    it('waits two seconds, so scrolling the chips does not open one', async () => {
        // RN's default is 500ms. A chip is small and sits in a horizontal scroller, so a
        // finger resting on one before flicking sideways is ordinary rather than rare.
        const tree = await render([pet()]);
        expect(chips(tree)[0].props.delayLongPress).toBe(2000);
    });

    it('still selects on a tap', async () => {
        const tree = await render([pet()]);
        await ReactTestRenderer.act(async () => chips(tree)[0].props.onPress());

        expect(onSelect).toHaveBeenCalledWith('1');
        expect(textOf(tree)).not.toContain('STR');
    });

    it('offers no action that would navigate away', async () => {
        // The preview opens from the middle of something else: choosing a breeding parent,
        // setting up a battle. Rename or Send from here would lose whatever was half-filled.
        const tree = await render([pet()]);
        await ReactTestRenderer.act(async () => chips(tree)[0].props.onLongPress());

        const shown = textOf(tree);
        for (const action of ['Battle', 'Rename', 'Allow', 'Equip', 'Send']) {
            expect(shown).not.toContain(action);
        }
    });

    it('closes again', async () => {
        const tree = await render([pet()]);
        await ReactTestRenderer.act(async () => chips(tree)[0].props.onLongPress());
        expect(textOf(tree)).toContain('STR');

        const close = tree.root.findAll((n) => n.props.accessibilityLabel === 'Close pet card')[0];
        await ReactTestRenderer.act(async () => close.props.onPress());
        expect(textOf(tree)).not.toContain('STR');
    });
});
