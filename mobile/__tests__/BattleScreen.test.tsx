/**
 * Battle, over the real `useBattlePanel` with `@shared/core` stubbed.
 *
 * The things worth pinning are the ones that decide whether a battle is legal
 * before a signature is asked for: only pets off cooldown can fight, the opponent
 * must be cleared when the fighter changes (it was picked against a different
 * level band), and `defenderOwner` must reach the mutation, since the backend needs it
 * to find the defence authorization, and pet ids are not unique across owners on
 * Solana.
 */

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { OpponentPet, Pet } from '@shared/core';

const pet = (over: Partial<Pet> = {}): Pet => ({
    id: '1',
    chain: 'evm',
    name: 'Rex',
    dna: 7n,
    level: 5,
    rarity: 2,
    winCount: 3,
    lossCount: 1,
    readyAt: 0,
    ...over,
});

const foe = (over: Partial<OpponentPet> = {}): OpponentPet => ({
    ...pet({ id: '9', name: 'Luna', level: 5 }),
    owner: '0xrival',
    ...over,
});

const mockState = {
    pets: [pet()] as Pet[],
    opponents: [foe()] as OpponentPet[],
    opponentsLoading: false,
    opponentsError: null as Error | null,
    isConnected: true,
    winProbability: 0.62 as number | null,
    turns: [] as { text: string }[],
};

const mockBattle = jest.fn();
const mockTaunts = jest.fn();
// `useCreateBattleRoom().createRoom` resolves to the room id itself, or null when
// it fails; it catches internally and never rejects. The mock returned a
// `{ roomId }` object before, which went unnoticed only because the value was
// discarded.
const mockCreateRoom = jest.fn<Promise<string | null>, unknown[]>(async () => 'r1');
/** Captures what the panel hands `useBattlePets`, which is where roomId matters. */
const mockBattleOptions: { roomId?: string | null } = {};
const mockWinEstimateArgs = jest.fn();

jest.mock('@shared/core', () => ({
    getReadyPetsUnified: (pets: Pet[]) =>
        pets.filter((p) => p.readyAt === 0).map((p) => ({ id: p.id, pet: p })),
    usePetList: () => ({ pets: mockState.pets, isLoading: false, error: null, refetch: jest.fn() }),
    useChainCapabilities: () => ({
        isConnected: mockState.isConnected,
        activeKind: mockState.isConnected ? 'evm' : null,
    }),
    useOpponents: () => ({
        opponents: mockState.opponents,
        isLoading: mockState.opponentsLoading,
        error: mockState.opponentsError,
        total: mockState.opponents.length,
        refetch: jest.fn(),
    }),
    useWinEstimate: (...args: unknown[]) => {
        mockWinEstimateArgs(...args);
        return { winProbability: mockState.winProbability, samples: 100, isLoading: false };
    },
    useBattleTaunts: () => ({
        generate: mockTaunts,
        reset: jest.fn(),
        turns: mockState.turns,
        isLoading: false,
    }),
    useCreateBattleRoom: () => ({ createRoom: mockCreateRoom, isLoading: false }),
    useBattlePets: (opts: { roomId?: string | null }) => {
        mockBattleOptions.roomId = opts?.roomId;
        return {
            mutate: mockBattle,
            isPending: false,
            error: null,
            phase: 'idle',
        };
    },
}));

jest.mock('../src/hooks/usePetErrorToast', () => ({ usePetErrorToast: () => {} }));

const mockRouteParams: { petId?: string } = {};
jest.mock('@react-navigation/native', () => ({
    useRoute: () => ({ params: mockRouteParams }),
}));

import BattleScreen from '../src/screens/BattleScreen';

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<BattleScreen />);
    });
    return tree;
};

const textOfNode = (node: ReactTestRenderer.ReactTestInstance): string =>
    node
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
        .join(' ');

const textOf = (tree: ReactTestRenderer.ReactTestRenderer) => textOfNode(tree.root);

const pressWith = async (tree: ReactTestRenderer.ReactTestRenderer, label: string) => {
    const target = tree.root
        .findAllByType(TouchableOpacity)
        .find((b) => textOfNode(b).includes(label));
    await ReactTestRenderer.act(async () => {
        target?.props.onPress();
    });
};

beforeEach(() => {
    mockState.pets = [pet()];
    mockState.opponents = [foe()];
    mockState.opponentsLoading = false;
    mockState.opponentsError = null;
    mockState.isConnected = true;
    mockState.winProbability = 0.62;
    mockState.turns = [];
    delete mockRouteParams.petId;
    jest.clearAllMocks();
});

describe('BattleScreen', () => {
    it('asks for a wallet before showing the arena', async () => {
        mockState.isConnected = false;
        const tree = await render();
        expect(textOf(tree)).toContain('Connect a wallet');
    });

    it('offers only pets off cooldown', async () => {
        // A pet that just fought cannot legally battle, so it must not be offered.
        mockState.pets = [pet(), pet({ id: '2', name: 'Cooling', readyAt: 9_999_999_999 })];
        const tree = await render();
        expect(textOf(tree)).toContain('Rex');
        expect(textOf(tree)).not.toContain('Cooling');
    });

    it('preselects the pet a Gallery battle action arrived with', async () => {
        mockState.pets = [pet(), pet({ id: '2', name: 'Momo' })];
        mockRouteParams.petId = '2';
        const tree = await render();
        await pressWith(tree, 'Luna');
        await pressWith(tree, 'Start Battle');
        expect(mockBattle).toHaveBeenCalledWith(
            expect.objectContaining({ petId1: '2', petId2: '9' }),
        );
    });

    it('sends defenderOwner, which the backend needs to find the consent grant', async () => {
        const tree = await render();
        await pressWith(tree, 'Rex');
        await pressWith(tree, 'Luna');
        await pressWith(tree, 'Start Battle');
        expect(mockBattle).toHaveBeenCalledWith({
            petId1: '1',
            petId2: '9',
            defenderOwner: '0xrival',
        });
    });

    it('will not start without both sides chosen', async () => {
        const tree = await render();
        await pressWith(tree, 'Rex');
        await pressWith(tree, 'Start Battle');
        expect(mockBattle).not.toHaveBeenCalled();
        expect(textOf(tree)).toContain('Pick one of your pets and an opponent');
    });

    it('clears the opponent when the fighter changes', async () => {
        // The pick was made against a different level band, so keeping it would
        // silently fight a match the player never chose.
        mockState.pets = [pet(), pet({ id: '2', name: 'Momo', level: 20 })];
        const tree = await render();
        await pressWith(tree, 'Rex');
        await pressWith(tree, 'Luna');
        await pressWith(tree, 'Momo');
        await pressWith(tree, 'Start Battle');
        expect(mockBattle).not.toHaveBeenCalled();
    });

    it('generates taunts before fighting, which also primes the result dialogue', async () => {
        const tree = await render();
        await pressWith(tree, 'Rex');
        await pressWith(tree, 'Luna');
        await pressWith(tree, 'Start Battle');
        expect(mockTaunts).toHaveBeenCalledWith(
            expect.objectContaining({
                chain: 'evm',
                attacker: expect.objectContaining({ petId: '1', dna: '7' }),
                defender: expect.objectContaining({ petId: '9' }),
            }),
        );
    });

    it('mints a room, but fights anyway when that fails', async () => {
        // The receipt settles a battle, not the room, so a failed mint must not
        // block the fight.
        mockCreateRoom.mockRejectedValueOnce(new Error('room service down'));
        const tree = await render();
        await pressWith(tree, 'Rex');
        await pressWith(tree, 'Luna');
        await pressWith(tree, 'Start Battle');
        expect(mockCreateRoom).toHaveBeenCalled();
        expect(mockBattle).toHaveBeenCalled();
    });

    it('links the battle to the room it minted', async () => {
        // `accept` records roomId on the ledger row, and that is the only thing
        // that makes the backend notify the room as the battle changes state.
        // Minting a room without passing it here leaves it attached to nothing and
        // every spectator holding the link uninformed.
        const tree = await render();
        await pressWith(tree, 'Rex');
        await pressWith(tree, 'Luna');
        await pressWith(tree, 'Start Battle');

        expect(mockBattleOptions.roomId).toBe('r1');
        expect(mockBattle).toHaveBeenCalled();
    });

    it('does not hand a failed mint the previous battle’s room', async () => {
        // Reusing it would push this fight's updates to a room full of the wrong
        // spectators, which is worse than having no room at all.
        const tree = await render();
        await pressWith(tree, 'Rex');
        await pressWith(tree, 'Luna');
        await pressWith(tree, 'Start Battle');
        expect(mockBattleOptions.roomId).toBe('r1');

        mockCreateRoom.mockResolvedValueOnce(null);
        await pressWith(tree, 'Start Battle');

        expect(mockBattleOptions.roomId).toBeNull();
    });

    it('asks for the win estimate with both fighters', async () => {
        const tree = await render();
        await pressWith(tree, 'Rex');
        await pressWith(tree, 'Luna');
        expect(mockWinEstimateArgs).toHaveBeenCalledWith('evm', '1', '9');
        expect(textOf(tree)).toContain('62%');
    });

    it('says the estimate is unavailable rather than showing a fake number', async () => {
        mockState.winProbability = null;
        const tree = await render();
        await pressWith(tree, 'Rex');
        await pressWith(tree, 'Luna');
        expect(textOf(tree)).toContain('unavailable');
    });

    it('labels the match by level gap', async () => {
        mockState.opponents = [foe({ id: '9', name: 'Luna', level: 11 })];
        const tree = await render();
        await pressWith(tree, 'Rex');
        expect(textOf(tree)).toContain('+6 lv');
    });

    it('shows the taunts once they arrive', async () => {
        mockState.turns = [{ text: 'You call that a stance?' }];
        const tree = await render();
        expect(textOf(tree)).toContain('You call that a stance?');
    });

    it('surfaces an opponent load failure', async () => {
        mockState.opponentsError = new Error('backend unreachable');
        mockState.opponents = [];
        const tree = await render();
        expect(textOf(tree)).toContain('backend unreachable');
    });
});
