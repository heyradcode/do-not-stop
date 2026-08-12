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
    /** Which filter emptied the opponent list; the server names it. */
    emptyReason: null as string | null,
    isConnected: true,
    winProbability: 0.62 as number | null,
    turns: [] as { text: string }[],
    /** Post-fight reactions. `taunt` turns are filtered out before rendering. */
    dialogueTurns: [] as { speaker: string; phase: string; text: string }[],
    dialogueLoading: false,
    /**
     * The client's own replay of the verified receipt, which is the only thing the
     * scene animates. Null until a battle resolves, and absent entirely when a check
     * failed — so an unverified fight has nothing to show rather than something
     * unverified to show.
     */
    liveReplay: null as {
        log: Record<string, unknown>[];
        startHp1: bigint;
        startHp2: bigint;
    } | null,
};

/** One strike, shaped as `StrikeLogEntry`. */
const strike = (over: Record<string, unknown> = {}) => ({
    round: 1,
    attacker: 1,
    isMagic: false,
    damage: 10n,
    heal: 0n,
    crit: false,
    elementMult: 100,
    furyTriggered: false,
    rebirthTriggered: false,
    hp1After: 100n,
    hp2After: 90n,
    ...over,
});

const mockBattle = jest.fn();
const mockTaunts = jest.fn();
// `useCreateBattleRoom().createRoom` resolves to the room id itself, or null when
// it fails; it catches internally and never rejects. The mock returned a
// `{ roomId }` object before, which went unnoticed only because the value was
// discarded.
const mockCreateRoom = jest.fn<Promise<string | null>, unknown[]>(async () => 'r1');
/** Captures what the panel hands `useBattlePets`, which is where roomId matters. */
const mockBattleOptions: { roomId?: string | null; roomSocketUrl?: string } = {};
const mockWinEstimateArgs = jest.fn();
/** Captures what the result dialogue is asked for, including the personas fallback. */
const mockDialogueArgs = jest.fn();

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
        emptyReason: mockState.emptyReason,
        refetch: jest.fn(),
    }),
    // The real wording, so a new reason cannot be added to the server without this
    // screen learning to say it.
    describeNoOpponents: (...args: unknown[]) =>
        jest
            .requireActual('../../shared/src/hooks/battle/useOpponents')
            .describeNoOpponents(...args),
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
    toDialoguePet: (subject: Pet | OpponentPet) => ({
        petId: subject.id,
        name: subject.name,
        level: subject.level,
        rarity: subject.rarity,
        dna: subject.dna.toString(),
        winCount: subject.winCount,
        lossCount: subject.lossCount,
    }),
    useBattleDialogue: (opts: Record<string, unknown>) => {
        mockDialogueArgs(opts);
        return { turns: mockState.dialogueTurns, isLoading: mockState.dialogueLoading };
    },
    useBattlePets: (opts: { roomId?: string | null; roomSocketUrl?: string }) => {
        mockBattleOptions.roomId = opts?.roomId;
        mockBattleOptions.roomSocketUrl = opts?.roomSocketUrl;
        return {
            mutate: mockBattle,
            isPending: false,
            error: null,
            phase: 'idle',
            liveReplay: mockState.liveReplay,
        };
    },
    // The real hook, not a stub: the replay's stepping and its done-gate are the
    // behaviour under test, and a fake would only assert the fake. Pulled in by
    // relative path because the barrel this factory replaces is what drags the Solana
    // runtime into jest.
    useLiveBattleAnimation: (...args: unknown[]) =>
        jest
            .requireActual('../../shared/src/hooks/battle/useLiveBattleAnimation')
            .useLiveBattleAnimation(...args),
    describeMechanicalLogEntry: (...args: unknown[]) =>
        jest
            .requireActual('../../shared/src/hooks/battle/useLiveBattleAnimation')
            .describeMechanicalLogEntry(...args),
}));

jest.mock('../src/hooks/usePetErrorToast', () => ({ usePetErrorToast: () => {} }));

const mockRouteParams: { petId?: string } = {};
jest.mock('@react-navigation/native', () => ({
    useRoute: () => ({ params: mockRouteParams }),
}));

import BattleScreen from '../src/screens/BattleScreen';

/**
 * Every tree rendered by a test, so `afterEach` can unmount them.
 *
 * Without this a finished test's component stays mounted and its replay timer keeps
 * firing into the next one, re-rendering a dead tree *after* `jest.clearAllMocks()` has
 * run. The symptom is a test that passes alone and fails in the file, because the last
 * recorded call belongs to the previous test's component rather than this one's.
 */
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<BattleScreen />);
    });
    mounted.push(tree);
    return tree;
};

afterEach(async () => {
    await ReactTestRenderer.act(async () => {
        for (const tree of mounted.splice(0)) tree.unmount();
    });
});

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
    mockState.emptyReason = null;
    mockState.isConnected = true;
    mockState.winProbability = 0.62;
    mockState.turns = [];
    mockState.liveReplay = null;
    mockState.dialogueTurns = [];
    mockState.dialogueLoading = false;
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

    it('subscribes to the room socket so updates arrive by push', async () => {
        // Polling still carries the battle either way; this is what makes it
        // prompt. The URL is derived from API_URL, so it must be a ws scheme
        // pointing at the §J endpoint rather than the http one it came from.
        const tree = await render();
        await pressWith(tree, 'Rex');
        await pressWith(tree, 'Luna');

        expect(mockBattleOptions.roomSocketUrl).toMatch(/^wss?:\/\/.+\/ws\/battle-room$/);
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

/**
 * The replay is presentation over a verified receipt, never a source of truth.
 *
 * `useBattlePets` only exposes `liveReplay` once every verification check has passed,
 * so there is no state where the scene animates a fight the receipt does not commit to.
 * What is worth pinning here is the other half: that the verdict waits for the fight to
 * finish, and that a battle with nothing to animate still reports its result at once.
 */
describe('battle replay', () => {
    const replay = (log: ReturnType<typeof strike>[]) => ({
        log,
        startHp1: 100n,
        startHp2: 100n,
    });

    it('shows nothing to watch until a replay exists', async () => {
        const tree = await render();
        expect(textOf(tree)).not.toContain('Bracing for the first strike');
    });

    it('opens on full bars, before any strike has played', async () => {
        mockState.liveReplay = replay([strike()]);
        const tree = await render();
        // Both fighters at 100%: the first strike has not landed yet.
        expect(textOf(tree)).toContain('Bracing for the first strike');
        expect(textOf(tree)).toContain('100%');
    });

    it('plays a strike, dropping the defender and narrating it', async () => {
        mockState.liveReplay = replay([strike({ hp1After: 100n, hp2After: 60n })]);
        const tree = await render();

        await ReactTestRenderer.act(async () => {
            await new Promise((r) => setTimeout(r, 750));
        });

        const rendered = textOf(tree);
        expect(rendered).toContain('60%');
        expect(rendered).toContain('lands a physical strike');
        // The mechanical log names both fighters, unlike the one-line flourish.
        expect(rendered).toContain('Round 1');
        expect(rendered).toContain('Rex');
    });

    it('reports the whole log as history, oldest first', async () => {
        mockState.liveReplay = replay([
            strike({ round: 1, hp2After: 70n }),
            strike({ round: 2, attacker: 2, crit: true, hp1After: 55n }),
        ]);
        const tree = await render();

        // One act per strike. The next timer is only armed by the effect that runs
        // after React re-renders from the previous one, so a single long wait would
        // play the first strike and never schedule the second.
        for (let i = 0; i < 2; i++) {
            await ReactTestRenderer.act(async () => {
                await new Promise((r) => setTimeout(r, 750));
            });
        }

        const rendered = textOf(tree);
        expect(rendered.indexOf('Round 1')).toBeLessThan(rendered.indexOf('Round 2'));
        expect(rendered).toContain('Crit!');
    });
});

/**
 * The result dialogue, and the reason it needs personas captured at battle start.
 *
 * Publishing a receipt puts the fighter on cooldown, so it leaves `readyPets` and
 * `fighter` reads null exactly when the result is on screen. Anything naming the two
 * afterwards has to fall back to what was captured when the fight began.
 */
describe('result dialogue', () => {
    const startBattle = async (tree: ReactTestRenderer.ReactTestRenderer) => {
        await pressWith(tree, 'Rex');
        await pressWith(tree, 'Luna');
        await pressWith(tree, 'Start Battle');
    };

    it('asks only for the post-fight phase, since taunts already played', async () => {
        mockState.dialogueTurns = [
            { speaker: 'attacker', phase: 'taunt', text: 'Before the fight.' },
            { speaker: 'defender', phase: 'result', text: 'Well fought.' },
        ];
        const tree = await render();
        await startBattle(tree);

        // A taunt turn reaching the result sheet would replay pre-fight lines after it.
        expect(textOf(tree)).not.toContain('Before the fight.');
    });

    it('names both fighters from the captured personas once the fighter is on cooldown', async () => {
        const tree = await render();
        await startBattle(tree);

        // The receipt has published, so the fighter is cooling down and out of the list.
        mockState.pets = [pet({ readyAt: 9_999_999_999 })];
        mockState.opponents = [];
        await ReactTestRenderer.act(async () => {
            tree.update(<BattleScreen />);
        });

        const asked = mockDialogueArgs.mock.calls.at(-1)?.[0] as {
            attacker: { name: string } | null;
            defender: { name: string } | null;
        };
        expect(asked.attacker?.name).toBe('Rex');
        expect(asked.defender?.name).toBe('Luna');
    });

    it('narrates the strike log with those names too, not "Your pet"', async () => {
        mockState.liveReplay = { log: [strike({ hp2After: 80n })], startHp1: 100n, startHp2: 100n };
        const tree = await render();
        await startBattle(tree);

        mockState.pets = [pet({ readyAt: 9_999_999_999 })];
        await ReactTestRenderer.act(async () => {
            tree.update(<BattleScreen />);
        });
        await ReactTestRenderer.act(async () => {
            await new Promise((r) => setTimeout(r, 750));
        });

        expect(textOf(tree)).toContain('Rex');
        expect(textOf(tree)).not.toContain('Your pet strikes');
    });
});

/**
 * Why the opponent list is empty.
 *
 * Four very different situations render as the same blank picker, and only some are the
 * player's to act on. The server names which filter emptied it precisely so the client
 * does not have to guess, and mobile discarded that until now — a roster nobody had
 * indexed and a rival who had simply not allowed challenges both read as
 * "No opponents available right now."
 */
describe('empty opponent list', () => {
    beforeEach(() => {
        mockState.opponents = [];
    });

    it('says an unindexed roster is not the player’s to fix', async () => {
        mockState.emptyReason = 'roster-empty';
        const tree = await render();
        expect(textOf(tree)).toContain('server-side gap');
    });

    it('points at the other player when nobody has allowed challenges', async () => {
        mockState.emptyReason = 'no-consent';
        const tree = await render();
        expect(textOf(tree)).toContain('Allow Challenges');
    });

    it('distinguishes consent signed under older rules from none at all', async () => {
        mockState.emptyReason = 'consent-stale';
        const tree = await render();
        expect(textOf(tree)).toContain('older set of battle rules');
    });

    it('tells a player on cooldown to come back, not that the game is empty', async () => {
        mockState.emptyReason = 'all-on-cooldown';
        const tree = await render();
        expect(textOf(tree)).toContain('Try again shortly');
    });

    it('falls back to a plain line when the server names no reason', async () => {
        mockState.emptyReason = null;
        const tree = await render();
        expect(textOf(tree)).toContain('No opponents available');
    });
});
