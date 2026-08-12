/**
 * The leaderboard renders the page the backend ranked and never re-sorts it.
 *
 * The trap worth a test is the medal: it belongs to a rank, not to a position in the
 * page, so page two grows no medals and a search that turns up the leader still shows
 * it as the leader. Ranks arrive absolute for exactly this reason.
 *
 * `@shared/core` is stubbed — its barrel drags the Solana runtime into jest.
 */

import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

const mockState = {
    walletAddress: '0xAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaa' as string | null,
    petEntries: [] as Record<string, unknown>[],
    playerEntries: [] as Record<string, unknown>[],
    total: 0,
    isLoading: false,
    error: null as Error | null,
    rank: null as Record<string, unknown> | null,
};

/**
 * Pass-through here: these suites are about what the screen draws once the session
 * exists. The gate has its own suite, so re-exercising it five times would only make
 * every fixture carry auth state it does not use.
 */
jest.mock('../src/components/SessionGate', () => {
    const React_ = jest.requireActual('react');
    return ({ children }: { children: React.ReactNode }) =>
        React_.createElement(React_.Fragment, null, children);
});

jest.mock('@shared/core', () => ({
    getRarityColor: () => '#ffffff',
    shortAddress: (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`,
    sameAccount: (a: string, b: string) => a.toLowerCase() === b.toLowerCase(),
    useChainCapabilities: () => ({
        activeKind: 'ethereum',
        walletAddress: mockState.walletAddress,
    }),
    useLeaderboard: ({ enabled }: { enabled: boolean }) => ({
        entries: enabled ? mockState.petEntries : [],
        total: enabled ? mockState.total : 0,
        pageSize: 20,
        isLoading: mockState.isLoading,
        error: mockState.error,
    }),
    usePlayerLeaderboard: ({ enabled }: { enabled: boolean }) => ({
        entries: enabled ? mockState.playerEntries : [],
        total: enabled ? mockState.total : 0,
        pageSize: 20,
        isLoading: mockState.isLoading,
        error: mockState.error,
    }),
    usePlayerRank: () => ({ rank: mockState.rank, isLoading: false }),
}));

jest.mock('../src/components/PetArt', () => () => null);

import LeaderboardScreen from '../src/screens/LeaderboardScreen';

const petEntry = (over: Record<string, unknown> = {}) => ({
    rank: 1,
    id: '1',
    chain: 'ethereum',
    owner: '0xBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbb',
    name: 'caipet',
    dna: '5565590272533216',
    level: 3,
    rarity: 1,
    winCount: 4,
    lossCount: 1,
    asset: '',
    ...over,
});

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<LeaderboardScreen />);
    });
    return tree;
};

const textOf = (tree: ReactTestRenderer.ReactTestRenderer): string =>
    tree.root
        .findAllByType(Text)
        .map((node) => {
            // RN's Text nests a native element, so `children` holds instances rather
            // than strings; the props are where the text actually is.
            const walk = (c: unknown): string =>
                typeof c === 'string' || typeof c === 'number'
                    ? String(c)
                    : Array.isArray(c)
                      ? c.map(walk).join('')
                      : '';
            return walk(node.props.children);
        })
        .join(' | ');

/**
 * Found by accessibility label rather than by serializing the subtree: a rendered pet
 * carries a BigInt dna, which `JSON.stringify` refuses outright.
 */
const showPlayers = async (tree: ReactTestRenderer.ReactTestRenderer) => {
    const tab = tree.root
        .findAllByType(TouchableOpacity)
        .find((node) => node.props.accessibilityLabel === 'Show Players board');
    await ReactTestRenderer.act(async () => tab!.props.onPress());
};

/** Every row's border colour, in render order. Medals show up here. */
const rowBorders = (tree: ReactTestRenderer.ReactTestRenderer): unknown[] =>
    tree.root
        .findAllByType(View)
        .map((node) => {
            const style = node.props.style;
            const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
            return flat?.borderColor;
        })
        .filter(Boolean);

beforeEach(() => {
    mockState.walletAddress = '0xAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaa';
    mockState.petEntries = [];
    mockState.playerEntries = [];
    mockState.total = 0;
    mockState.isLoading = false;
    mockState.error = null;
    mockState.rank = null;
});

describe('empty and loading states', () => {
    it('tells a player with no battles that the board fills up, not that it is broken', async () => {
        const tree = await render();
        expect(textOf(tree)).toContain('No battles on record yet');
    });

    it('says nothing matched rather than reusing the no-battles copy', async () => {
        const tree = await render();
        await ReactTestRenderer.act(async () => {
            tree.root.findByType(TextInput).props.onChangeText('zzz');
        });
        // The 300 ms debounce has to elapse before the term reaches the query, and it
        // has to do so in its own act: the effect that arms the timer only runs after
        // the render the keystroke caused.
        await ReactTestRenderer.act(async () => {
            await new Promise((r) => setTimeout(r, 350));
        });
        expect(textOf(tree)).toContain('matches "zzz"');
        expect(textOf(tree)).not.toContain('No battles on record yet');
    });

    it('reports an error instead of an empty board', async () => {
        mockState.error = new Error('backend unreachable');
        const tree = await render();
        expect(textOf(tree)).toContain('backend unreachable');
    });
});

describe('your standing', () => {
    it('calls an unranked player unranked, which is a real state and not an error', async () => {
        const tree = await render();
        expect(textOf(tree)).toContain('Unranked');
    });

    it('shows the rank the backend gave, not one counted from the page', async () => {
        mockState.rank = { rank: 42, owner: '0xAA', winCount: 7, lossCount: 3, petCount: 2 };
        const tree = await render();
        expect(textOf(tree)).toContain('#42');
        expect(textOf(tree)).toContain('7W 3L');
    });
});

describe('ranking', () => {
    it('medals by absolute rank, so page two grows none', async () => {
        // Ranks 21-23: the first rows of page two, and nothing here is a medal.
        mockState.petEntries = [21, 22, 23].map((rank) => petEntry({ rank, id: String(rank) }));
        mockState.total = 60;
        const tree = await render();

        const medals = ['#ffd45e', '#c9d4e4', '#d08a52'];
        expect(rowBorders(tree).filter((c) => medals.includes(c as string))).toHaveLength(0);
        expect(textOf(tree)).toContain('21');
    });

    it('medals the top three when they are the ones on screen', async () => {
        mockState.petEntries = [1, 2, 3, 4].map((rank) => petEntry({ rank, id: String(rank) }));
        mockState.total = 4;
        const tree = await render();

        const medals = ['#ffd45e', '#c9d4e4', '#d08a52'];
        expect(rowBorders(tree).filter((c) => medals.includes(c as string))).toHaveLength(3);
    });

    it('renders rows in the order given, never re-sorted locally', async () => {
        // Deliberately not in win order: the backend ranks on the merged record, so a
        // local sort could only disagree with the rank printed beside each row.
        mockState.petEntries = [
            petEntry({ rank: 1, id: '1', name: 'first', winCount: 2, lossCount: 0 }),
            petEntry({ rank: 2, id: '2', name: 'second', winCount: 9, lossCount: 9 }),
        ];
        mockState.total = 2;
        const tree = await render();
        expect(textOf(tree).indexOf('first')).toBeLessThan(textOf(tree).indexOf('second'));
    });
});

describe('boards', () => {
    it('starts on pets and switches to players', async () => {
        mockState.petEntries = [petEntry({ name: 'caipet' })];
        mockState.playerEntries = [
            {
                rank: 1,
                owner: '0xCCccCCccCCccCCccCCccCCccCCccCCccCCccCCcc',
                winCount: 5,
                lossCount: 2,
                petCount: 3,
            },
        ];
        mockState.total = 1;

        const tree = await render();
        expect(textOf(tree)).toContain('caipet');

        await showPlayers(tree);

        expect(textOf(tree)).toContain('3 pets');
        expect(textOf(tree)).not.toContain('caipet');
    });

    it('marks the connected wallet on the player board', async () => {
        mockState.playerEntries = [
            {
                rank: 1,
                owner: mockState.walletAddress!.toLowerCase(),
                winCount: 1,
                lossCount: 0,
                petCount: 1,
            },
        ];
        mockState.total = 1;

        const tree = await render();
        await showPlayers(tree);

        expect(textOf(tree)).toContain('you');
    });
});
