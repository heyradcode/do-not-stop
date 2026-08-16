import { useEffect, useMemo, useState } from 'react';
import {
    getRarityColor,
    sameAccount,
    shortAddress,
    useChainCapabilities,
    useLeaderboard,
    usePlayerLeaderboard,
    usePlayerRank,
    type PetChain,
} from '@shared/core';

/** Which ranking is showing. Pets is the default: it is the one with a pet in it. */
export type Board = 'pets' | 'players';

export const BOARDS: readonly { id: Board; label: string }[] = [
    { id: 'pets', label: 'Pets' },
    { id: 'players', label: 'Players' },
];

/** What one row shows, whichever board produced it. */
export type Standing = {
    key: string;
    rank: number;
    /** Rendered as pet art on the pet board, an emoji on the player board. */
    pet: { id: string; chain: PetChain; assetKey?: string; dna: bigint } | null;
    title: string;
    sub: string;
    /** The pet's own rarity colour, tinting its row. Null on the player board. */
    accent: string | null;
    winCount: number;
    lossCount: number;
    isYou: boolean;
};

export interface UseLeaderboardPanel {
    board: Board;
    onBoardChange: (board: Board) => void;
    /** The raw field value, updated on every keystroke. The query is debounced behind it. */
    term: string;
    onTermChange: (term: string) => void;
    /** What is actually being searched for, which the empty state quotes back. */
    search: string;
    page: number;
    onPage: (page: number) => void;
    lastPage: number;
    /** One-based bounds of the page on screen, for "12 to 24 of 300". */
    firstOnPage: number;
    lastOnPage: number;
    total: number;
    isLoading: boolean;
    error: Error | null;
    /** Both boards flattened to one shape, so a single row renderer takes either. */
    standings: Standing[];
    /** The caller's own rank, or null when they have never fought. */
    yourRank: { rank: number; winCount: number; lossCount: number } | null;
}

/**
 * Headless controller for the leaderboard.
 *
 * The screen held all of this: two boards, a debounce, a pager and the flattening that lets
 * one row renderer take either board. That is a state machine by this project's own test, and
 * it left the view at 512 lines, the largest file in the app.
 */
export const useLeaderboardPanel = (): UseLeaderboardPanel => {
    const { activeKind, walletAddress } = useChainCapabilities();
    const [board, setBoard] = useState<Board>('pets');
    const [page, setPage] = useState(0);
    const [term, setTerm] = useState('');

    // 300 ms, matching frontend and `useSearchPets`: a round trip per keystroke against a
    // ranked query is a lot of work to throw away, and a board is not a typeahead.
    const [search, setSearch] = useState('');
    useEffect(() => {
        const id = setTimeout(() => setSearch(term.trim()), 300);
        return () => clearTimeout(id);
    }, [term]);

    // A term that narrows the board also renumbers which page anything is on, so the reader
    // has to be put back at the first one or a search can land on an empty page.
    useEffect(() => setPage(0), [search, board]);

    const pets = useLeaderboard({ chain: activeKind, page, search, enabled: board === 'pets' });
    const players = usePlayerLeaderboard({
        chain: activeKind,
        page,
        search,
        enabled: board === 'players',
    });
    const { rank: yourRank } = usePlayerRank(activeKind);

    const active = board === 'pets' ? pets : players;

    // `sameAccount` normalizes by address shape, so this needs no chain branch and cannot
    // merge two Solana pubkeys differing only in case.
    const isYou = (owner: string) => sameAccount(owner, walletAddress ?? '');

    const standings: Standing[] = useMemo(
        () =>
            board === 'pets'
                ? pets.entries.map((entry) => ({
                      key: entry.id,
                      rank: entry.rank,
                      pet: {
                          id: entry.id,
                          chain: entry.chain,
                          assetKey: entry.asset || undefined,
                          dna: BigInt(entry.dna),
                      },
                      title: entry.name,
                      sub: `Lv ${entry.level}`,
                      accent: getRarityColor(entry.rarity),
                      winCount: entry.winCount,
                      lossCount: entry.lossCount,
                      isYou: isYou(entry.owner),
                  }))
                : players.entries.map((entry) => ({
                      key: entry.owner,
                      rank: entry.rank,
                      pet: null,
                      title: shortAddress(entry.owner),
                      sub: `${entry.petCount} pet${entry.petCount === 1 ? '' : 's'}`,
                      accent: null,
                      winCount: entry.winCount,
                      lossCount: entry.lossCount,
                      isYou: isYou(entry.owner),
                  })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [board, pets.entries, players.entries, walletAddress],
    );

    return {
        board,
        onBoardChange: setBoard,
        term,
        onTermChange: setTerm,
        search,
        page,
        onPage: setPage,
        lastPage: Math.max(0, Math.ceil(active.total / active.pageSize) - 1),
        firstOnPage: page * active.pageSize + 1,
        lastOnPage: Math.min(active.total, (page + 1) * active.pageSize),
        total: active.total,
        isLoading: active.isLoading,
        error: active.error,
        standings,
        yourRank,
    };
};
