/**
 * The leaderboard's state machine, now that it is one.
 *
 * None of this was reachable while it lived inside a 512-line screen: the debounce and the
 * two page resets could each be deleted with every test still green, which is how they were
 * found. Driven through a probe rather than the screen, because what is being pinned is when
 * the query changes, not what the rows look like.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

const mockState = {
    petsArgs: [] as { page: number; search: string; enabled: boolean }[],
    playersArgs: [] as { page: number; search: string; enabled: boolean }[],
};

const board = (args: { page: number; search: string; enabled: boolean }, into: unknown[]) => {
    into.push(args);
    return { entries: [], total: 0, pageSize: 25, isLoading: false, error: null };
};

jest.mock('@shared/core', () => ({
    useChainCapabilities: () => ({ activeKind: 'evm', walletAddress: '0xme' }),
    useLeaderboard: (a: never) => board(a, mockState.petsArgs),
    usePlayerLeaderboard: (a: never) => board(a, mockState.playersArgs),
    usePlayerRank: () => ({ rank: null }),
    getRarityColor: () => '#fff',
    sameAccount: (a: string, b: string) => a.toLowerCase() === b.toLowerCase(),
    shortAddress: (a: string) => a,
}));

import { useLeaderboardPanel, type UseLeaderboardPanel } from '../src/hooks/leaderboard/useLeaderboardPanel';

let panel!: UseLeaderboardPanel;

const Probe = () => {
    panel = useLeaderboardPanel();
    return null;
};

const mount = async () => {
    await ReactTestRenderer.act(async () => {
        ReactTestRenderer.create(<Probe />);
    });
};

/** Runs the 300ms debounce out. */
const debounce = async () => {
    await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(400);
    });
};

const act = async (fn: () => void) => {
    await ReactTestRenderer.act(async () => fn());
};

/** What the active board was last asked for. */
const lastQuery = () => mockState.petsArgs[mockState.petsArgs.length - 1];

beforeEach(() => {
    jest.useFakeTimers();
    mockState.petsArgs = [];
    mockState.playersArgs = [];
});

afterEach(() => jest.useRealTimers());

describe('useLeaderboardPanel', () => {
    it('waits before searching, so a ranked query is not run per keystroke', async () => {
        await mount();
        await act(() => panel.onTermChange('Rex'));

        // The field updates at once; the query does not.
        expect(panel.term).toBe('Rex');
        expect(lastQuery().search).toBe('');

        await debounce();
        expect(lastQuery().search).toBe('Rex');
    });

    it('trims the term, so trailing space is not part of the search', async () => {
        await mount();
        await act(() => panel.onTermChange('  Rex  '));
        await debounce();
        expect(lastQuery().search).toBe('Rex');
    });

    it('goes back to the first page when the search changes', async () => {
        // A term that narrows the board renumbers which page anything is on, so a search made
        // from page three would otherwise land on a page that no longer has rows.
        await mount();
        await act(() => panel.onPage(3));
        expect(panel.page).toBe(3);

        await act(() => panel.onTermChange('Rex'));
        await debounce();
        expect(panel.page).toBe(0);
    });

    it('goes back to the first page when the board changes', async () => {
        // The two boards are different lengths, so page three of one need not exist on the
        // other.
        await mount();
        await act(() => panel.onPage(3));
        await act(() => panel.onBoardChange('players'));

        expect(panel.page).toBe(0);
    });

    it('asks only the board that is showing', async () => {
        // Both hooks are called on every render because hooks must be; `enabled` is what
        // stops the hidden one issuing a query.
        await mount();
        expect(lastQuery().enabled).toBe(true);
        expect(mockState.playersArgs[mockState.playersArgs.length - 1].enabled).toBe(false);

        await act(() => panel.onBoardChange('players'));
        expect(mockState.playersArgs[mockState.playersArgs.length - 1].enabled).toBe(true);
    });
});
