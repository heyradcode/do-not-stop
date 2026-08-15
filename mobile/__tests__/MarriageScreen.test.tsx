/**
 * Marriage, over the real `useMarriagePanel` with `@shared/core` stubbed. What is
 * worth pinning is the chain filtering (a marriage cannot cross chains), the
 * accept confirmation step, and the cache invalidation after a write — without
 * that last one every row keeps showing pre-write state.
 */

import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { Pet } from '@shared/core';
/**
 * `useSafeAreaInsets` throws outside a `SafeAreaProvider`, and this suite renders a screen on
 * its own. The library ships this mock for exactly that. Repeated per suite rather than
 * registered globally: a global one needs a `setupFiles` entry pointing at a file whose name
 * says nothing about what it does.
 */
jest.mock('react-native-safe-area-context', () =>
    require('react-native-safe-area-context/jest/mock').default,
);


const pet = (over: Partial<Pet> = {}): Pet => ({
    id: '1',
    chain: 'evm',
    name: 'Rex',
    dna: 0n,
    level: 5,
    rarity: 2,
    winCount: 0,
    lossCount: 0,
    readyAt: 0,
    ...over,
});

/** The default pet's id, so a test can say "this one is married" without repeating it. */
const MARRIED_ID = '1';

const proposal = (over: Record<string, unknown> = {}) => ({
    proposerPetId: '9',
    proposerPetName: 'Luna',
    proposerOwner: '0xabc',
    targetPetId: '1',
    expiry: 0,
    ...over,
});

const mockState = {
    pets: [pet()] as Pet[],
    kind: 'evm' as 'evm' | 'solana' | 'none',
    proposals: [] as ReturnType<typeof proposal>[],
    proposalsLoading: false,
    /** Which of `pets` `useMarriedPets` reports as married. */
    marriedIds: [] as string[],
    marriagesLoading: false,
    /** Bulk roster from `useAllPets`; a spouse is only sometimes in it. */
    roster: [{ id: '9', name: 'Luna' }] as { id: string; name: string }[],
    /** What a direct spouse lookup returns when the roster map has no answer. */
    fetchedSpouse: {} as { name?: string; level?: number },
    /** What `searchPets` returns for the partner field; someone else's pets. */
    searchResults: [] as { id: string; name: string; level: number; dna: bigint }[],
};

/** Every `useSpousePet` call the card made, to check it skips when it can. */
const mockSpouseLookups: { id: string; skip: boolean }[] = [];

const mockMutations = {
    propose: jest.fn(async () => undefined),
    accept: jest.fn(async () => undefined),
    cancel: jest.fn(async () => undefined),
    divorce: jest.fn(async () => undefined),
};
const mockInvalidate = jest.fn();
const mockRefetch = jest.fn();
const mockRefetchProposals = jest.fn();
const mockIncomingArgs = jest.fn();

jest.mock('@shared/core', () => ({
    // The real formatter, taken from its own module rather than the package barrel: the
    // barrel drags in `queryClient` and the rest of the surface this suite mocks away. It
    // is pure, and a stub would let the wording drift from the rows frontend renders.
    formatExpiry: jest.requireActual('../../shared/src/utils/common/time').formatExpiry,
    usePetList: () => ({ pets: mockState.pets, isLoading: false, error: null, refetch: mockRefetch }),
    useChainCapabilities: () => ({
        kind: mockState.kind,
        activeKind: mockState.kind === 'none' ? null : mockState.kind,
        walletAddress: '0xme',
    }),
    useAllPets: () => ({ pets: mockState.roster }),
    useSearchPets: (query: string) => ({
        results: query.trim() ? mockState.searchResults : [],
        isLoading: false,
        error: null,
        refetch: jest.fn(),
    }),
    getPetAvatar: () => '🐾',
    petArtUrl: () => null,
    useIncomingProposals: (...args: unknown[]) => {
        mockIncomingArgs(...args);
        return {
            proposals: mockState.proposals,
            isLoading: mockState.proposalsLoading,
            refetch: mockRefetchProposals,
        };
    },
    useMarriage: () => ({
        propose: { mutateAsync: mockMutations.propose, isPending: false },
        accept: { mutateAsync: mockMutations.accept, isPending: false },
        cancel: { mutateAsync: mockMutations.cancel, isPending: false },
        divorce: { mutateAsync: mockMutations.divorce, isPending: false },
    }),
    // Resolves a spouse the bulk roster does not hold. `skip` is what the card
    // passes when the map already answered, so honouring it here is what proves
    // the card is not firing a redundant request per married pet.
    useSpousePet: (_chain: unknown, id: string, opts?: { skip?: boolean }) => {
        mockSpouseLookups.push({ id, skip: Boolean(opts?.skip) });
        return opts?.skip ? {} : mockState.fetchedSpouse;
    },
}));

jest.mock('@tanstack/react-query', () => ({
    useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

/**
 * The married set, stubbed at the mobile hook rather than at wagmi's multicall.
 *
 * `useMarriedPets` has its own suite for the multicall shape and the chain split. Driving it
 * from here would put a tuple of contract results between this file and the thing it is
 * about, which is the screen.
 */
jest.mock('../src/hooks/marriage/useMarriedPets', () => ({
    useMarriedPets: (_chain: unknown, pets: { id: string }[]) => ({
        marriedPets: pets
            .filter((candidate) => mockState.marriedIds.includes(candidate.id))
            .map((candidate) => ({ pet: candidate, spouseId: '9' })),
        isLoading: mockState.marriagesLoading,
    }),
}));

const mockNotify = jest.fn();
jest.mock('../src/hooks/useNotifyError', () => ({ useNotifyError: () => mockNotify }));

import MarriageScreen from '../src/screens/MarriageScreen';

/**
 * Every tree is unmounted after its test.
 *
 * The Incoming tab polls on an interval, and an interval belonging to a component that is
 * never unmounted keeps Node's event loop alive: the suite passes and then jest hangs
 * instead of exiting, which reads as a broken test run rather than a leak.
 */
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<MarriageScreen />);
    });
    mounted.push(tree);
    return tree;
};

afterEach(async () => {
    await ReactTestRenderer.act(async () => {
        mounted.splice(0).forEach((tree) => tree.unmount());
    });
});

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

const pressWith = async (tree: ReactTestRenderer.ReactTestRenderer, label: string) => {
    const target = tree.root
        .findAllByType(TouchableOpacity)
        .find((b) => textOfNode(b).includes(label));
    await ReactTestRenderer.act(async () => {
        target?.props.onPress();
    });
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

const type = async (tree: ReactTestRenderer.ReactTestRenderer, value: string) => {
    await ReactTestRenderer.act(async () => {
        tree.root.findByType(TextInput).props.onChangeText(value);
    });
};

/**
 * Pick the partner the way a player does now: search, then tap a result.
 *
 * This screen used to take the partner's numeric id typed straight in, so these tests
 * typed one. A proposal still names an exact pet; what changed is that finding it no
 * longer requires already knowing its id.
 */
const choosePartner = async (tree: ReactTestRenderer.ReactTestRenderer, name: string) => {
    await type(tree, name);
    const row = tree.root
        .findAllByType(TouchableOpacity)
        .find((node) => node.props.accessibilityLabel === `Choose ${name}`);
    await ReactTestRenderer.act(async () => row!.props.onPress());
};

beforeEach(() => {
    mockState.pets = [pet()];
    mockState.kind = 'evm';
    mockState.proposals = [];
    mockState.proposalsLoading = false;
    mockState.marriedIds = [];
    mockState.marriagesLoading = false;
    mockState.roster = [{ id: '9', name: 'Luna' }];
    mockState.fetchedSpouse = {};
    mockState.searchResults = [{ id: '42', name: 'Nia', level: 3, dna: 1n }];
    mockSpouseLookups.length = 0;
    jest.clearAllMocks();
});

describe('MarriageScreen', () => {
    it('asks for a wallet before anything else', async () => {
        mockState.kind = 'none';
        const tree = await render();
        expect(textOf(tree)).toContain('Connect a wallet');
    });

    it('offers only pets on the active chain, since a marriage cannot cross chains', async () => {
        mockState.pets = [pet(), pet({ id: '2', name: 'Sol', chain: 'solana' })];
        const tree = await render();
        const rendered = textOf(tree);
        expect(rendered).toContain('Rex');
        expect(rendered).not.toContain('Sol');
    });

    it('queries proposals for the active chain and its pet ids', async () => {
        mockState.pets = [pet(), pet({ id: '2', name: 'Momo' })];
        await render();
        expect(mockIncomingArgs).toHaveBeenCalledWith('evm', ['1', '2']);
    });

    it('sends a proposal for the chosen pet and the partner found by search', async () => {
        const tree = await render();
        await pressWith(tree, 'Rex');
        await choosePartner(tree, 'Nia');
        await pressWith(tree, 'Send Proposal');
        expect(mockMutations.propose).toHaveBeenCalledWith({ petIdA: '1', petIdB: '42' });
    });

    it('keeps the player’s own pick out of the partner results', async () => {
        // Marrying a pet to itself is not a proposal anyone means to send, and the
        // search covers the whole roster, own pets included.
        mockState.searchResults = [
            { id: '1', name: 'Rex', level: 2, dna: 1n },
            { id: '42', name: 'Nia', level: 3, dna: 1n },
        ];
        const tree = await render();
        await pressWith(tree, 'Rex');
        await type(tree, 'e');

        const labels = tree.root
            .findAllByType(TouchableOpacity)
            .map((node) => node.props.accessibilityLabel);
        expect(labels).toContain('Choose Nia');
        expect(labels).not.toContain('Choose Rex');
    });

    it('refreshes contract reads after a write, or every row shows stale state', async () => {
        const tree = await render();
        await pressWith(tree, 'Rex');
        await choosePartner(tree, 'Nia');
        await pressWith(tree, 'Send Proposal');
        expect(mockRefetch).toHaveBeenCalled();
        const keys = mockInvalidate.mock.calls.map((c) => c[0].queryKey[0]);
        expect(keys).toEqual(
            expect.arrayContaining(['readContract', 'readContracts', 'incomingProposals']),
        );
    });

    it('reports a failed write instead of claiming success', async () => {
        mockMutations.propose.mockRejectedValueOnce(new Error('reverted'));
        const tree = await render();
        await pressWith(tree, 'Rex');
        await choosePartner(tree, 'Nia');
        await pressWith(tree, 'Send Proposal');
        expect(mockNotify).toHaveBeenCalledWith(
            'Marriage action failed',
            expect.any(Error),
            'marriage',
        );
        expect(textOf(tree)).not.toContain('Proposal sent!');
    });

    /*
     * `proposalTTL` is 60 seconds on this deployment (GameConfig's dev default; the source
     * notes prod is 7 days). A proposal can therefore lapse between opening the screen and
     * reaching for Accept, and the list only ever holds live ones, so without the window on
     * screen it just disappears and reads as never having arrived. That is exactly how a
     * real proposal, correctly written on chain, was reported as missing.
     */
    /*
     * A proposal that arrives while the tab is open used to be unreachable: the shared hook
     * caches for 15s and schedules nothing, and this panel dropped its `refetch`, so the
     * list only changed if you left the screen and came back. At a 60s expiry that is the
     * whole window.
     */
    it('keeps re-reading proposals while the Incoming tab is open', async () => {
        // The timer is spied rather than faked: `act` is async here, and fake timers
        // deadlock against it. What matters is that a repeating read is scheduled at all,
        // and that its callback re-reads, so drive the callback directly.
        const setSpy = jest.spyOn(global, 'setInterval');
        try {
            const tree = await render();
            await pressWith(tree, 'Incoming');

            const scheduled = setSpy.mock.calls.find(([, ms]) => ms === 10_000);
            expect(scheduled).toBeDefined();

            mockRefetchProposals.mockClear();
            await ReactTestRenderer.act(async () => {
                (scheduled![0] as () => void)();
            });
            expect(mockRefetchProposals).toHaveBeenCalled();
        } finally {
            setSpy.mockRestore();
        }
    });

    it('does not poll while the Propose tab is showing', async () => {
        // One multicall across the whole roster per tick, on a screen nobody is reading.
        const setSpy = jest.spyOn(global, 'setInterval');
        try {
            await render();
            expect(setSpy.mock.calls.some(([, ms]) => ms === 10_000)).toBe(false);
        } finally {
            setSpy.mockRestore();
        }
    });

    it('stops polling when the tab is left', async () => {
        const clearSpy = jest.spyOn(global, 'clearInterval');
        try {
            const tree = await render();
            await pressWith(tree, 'Incoming');
            clearSpy.mockClear();
            await pressWith(tree, 'Propose');

            expect(clearSpy).toHaveBeenCalled();
        } finally {
            clearSpy.mockRestore();
        }
    });

    it('shows how long an incoming proposal has left', async () => {
        mockState.proposals = [proposal({ expiry: Math.floor(Date.now() / 1000) + 45 })];
        const tree = await render();
        await pressWith(tree, 'Incoming');
        expect(textOf(tree)).toContain('Expires in 1m');
    });

    it('says a proposal has expired rather than showing a bare countdown', async () => {
        mockState.proposals = [proposal({ expiry: 1 })];
        const tree = await render();
        await pressWith(tree, 'Incoming');
        expect(textOf(tree)).toContain('Expired');
    });

    it('confirms before accepting, rather than marrying on one tap', async () => {
        mockState.proposals = [proposal()];
        const tree = await render();
        await pressWith(tree, 'Incoming');
        await pressWith(tree, 'Accept');
        expect(mockMutations.accept).not.toHaveBeenCalled();
        expect(textOf(tree)).toContain('Accept proposal?');
    });

    it('accepts with the proposer and the targeted pet once confirmed', async () => {
        mockState.proposals = [proposal()];
        const tree = await render();
        await pressWith(tree, 'Incoming');
        await pressWith(tree, 'Accept');
        // The dialog's Accept is the confirm; the row's opened it.
        const confirms = tree.root
            .findAllByType(TouchableOpacity)
            .filter((b) => textOfNode(b).includes('Accept'));
        await ReactTestRenderer.act(async () => {
            confirms[confirms.length - 1].props.onPress();
        });
        expect(mockMutations.accept).toHaveBeenCalledWith({ petIdA: '9', petIdB: '1' });
    });

    it('lists a married pet with its spouse and hides single ones', async () => {
        mockState.marriedIds = [MARRIED_ID];
        const tree = await render();
        expect(textOf(tree)).toContain('married to Luna');

        mockState.marriedIds = [];
        const single = await render();
        expect(textOf(single)).not.toContain('married to');
    });

    it('gives a page to each marriage, not to each pet', async () => {
        // The whole reason `useMarriedPets` exists. The card used to decide for itself
        // whether it was a marriage and render null if not, which a stacked list absorbed
        // silently; a pager allocates the page first, so three pets and one marriage would
        // be two blank screens to swipe past. The counter is what gives that away.
        mockState.pets = [pet(), pet({ id: '2' }), pet({ id: '3' })];
        mockState.marriedIds = [MARRIED_ID];

        const tree = await render();
        expect(textOf(tree)).toContain('1 / 1');
        expect(textOf(tree)).not.toContain('1 / 3');
    });

    it('says there are no marriages rather than showing an empty pager', async () => {
        mockState.marriedIds = [];
        expect(textOf(await render())).toContain('No active marriages');
    });

    it('does not claim there are none while it is still reading', async () => {
        // The read is a multicall across the roster. Showing the empty state until it lands
        // tells a player with four marriages they have none, every time the screen opens.
        mockState.marriagesLoading = true;
        expect(textOf(await render())).not.toContain('No active marriages');
    });

    it('does not look up a spouse the roster already named', async () => {
        // One redundant request per married pet otherwise, on every render.
        mockState.marriedIds = [MARRIED_ID];
        mockSpouseLookups.length = 0;
        await render();
        expect(mockSpouseLookups.every((l) => l.skip)).toBe(true);
    });

    it('names a spouse the roster does not hold', async () => {
        // The usual case: a spouse is someone else's pet, and `useAllPets` only
        // fetched a page. Without the direct lookup the card shows "pet #9", which
        // is the id the player already could not do anything with.
        mockState.marriedIds = [MARRIED_ID];
        mockState.roster = [];
        mockState.fetchedSpouse = { name: 'Momo', level: 4 };
        mockSpouseLookups.length = 0;

        const tree = await render();

        expect(mockSpouseLookups.some((l) => l.id === '9' && !l.skip)).toBe(true);
        expect(textOf(tree)).toContain('married to Momo');
    });

    it('falls back to the id when nothing can name the spouse', async () => {
        mockState.marriedIds = [MARRIED_ID];
        mockState.roster = [];
        mockState.fetchedSpouse = {};
        const tree = await render();
        expect(textOf(tree)).toContain('married to pet #9');
    });

    it('divorces the chosen pet', async () => {
        mockState.marriedIds = [MARRIED_ID];
        const tree = await render();
        await pressWith(tree, 'Divorce');
        expect(mockMutations.divorce).toHaveBeenCalledWith({ petId: '1' });
    });
});
