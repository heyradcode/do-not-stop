/**
 * The card that announces a fight.
 *
 * It is decoration, so what is worth pinning is not how it looks but that it says who is
 * fighting, that it always gets out of the way, and that it does so without movement when the
 * OS has asked for none.
 */

import React from 'react';
import { AccessibilityInfo } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { Pet } from '@shared/core';

jest.mock('@shared/core', () => ({
    getPetAvatar: () => '🐾',
    petArtUrl: () => null,
}));

import BattleSplash from '../src/screens/parts/BattleSplash';

import { allText, type Tree } from './support/harness';

/** Every string on screen. The walk itself lives in the shared harness. */
const textOf = (tree: Tree) => allText(tree, ' | ');

const pet = (over: Partial<Pet> = {}): Pet =>
    ({
        id: '1',
        chain: 'evm',
        name: 'Rex',
        dna: 0n,
        level: 3,
        rarity: 2,
        winCount: 0,
        lossCount: 0,
        readyAt: 0,
        ...over,
    }) as Pet;

const onDone = jest.fn();

const render = async (attacker: Pet | null = pet(), defender: Pet | null = pet({ id: '2' })) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <BattleSplash
                attackerName="Rex"
                defenderName="Luna"
                attacker={attacker}
                defender={defender}
                onDone={onDone}
            />,
        );
    });
    return tree;
};


/** Long enough for the whole timeline: wipe, slam, impact, hold and clear. */
const playOut = async () => {
    await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(4000);
    });
};

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('BattleSplash', () => {
    it('names both fighters and the fight', async () => {
        const tree = await render();
        const shown = textOf(tree);
        expect(shown).toContain('Rex');
        expect(shown).toContain('Luna');
        expect(shown).toContain('VS');
    });

    it('reads as one announcement to a screen reader, not three labels', async () => {
        const tree = await render();
        const labels = tree.root
            .findAll((n) => typeof n.props.accessibilityLabel === 'string')
            .map((n) => n.props.accessibilityLabel);
        expect(labels).toContain('Rex versus Luna');
    });

    it('always gets out of the way', async () => {
        // It covers the arena, so a card that never finishes is a fight the player can hear
        // happening and cannot see.
        await render();
        expect(onDone).not.toHaveBeenCalled();

        await playOut();
        expect(onDone).toHaveBeenCalled();
    });

    it('still announces the fight when the OS asks for no motion', async () => {
        jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
        const tree = await render();

        // Composed and still. Who is fighting whom is the point of the card, and that is
        // exactly the part that does not need movement.
        expect(textOf(tree)).toContain('Rex');
        expect(textOf(tree)).toContain('VS');

        await playOut();
        expect(onDone).toHaveBeenCalled();
    });

    it('falls back to the name when a pet has left the ready list', async () => {
        // `fighter` and `opponent` go null once a receipt publishes and the pet drops onto
        // cooldown. The card is entered before that, but a re-entry is not.
        const tree = await render(null, null);
        const shown = textOf(tree);
        expect(shown).toContain('Rex');
        expect(shown).toContain('Luna');
        expect(shown).toContain('?');
    });
});
