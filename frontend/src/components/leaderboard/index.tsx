import React, { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    useChainCapabilities,
    useLeaderboard,
    usePlayerLeaderboard,
} from '@shared/core';

import DashboardPanel from '@components/common/dashboard-panel';
import SessionGate from '@components/common/session-gate';
import PetArt from '@components/pet/pet-art';
import Icon, { TrophyIcon } from '@components/ui/icon';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { Tones } from '@constants/tones';
import { sameAccount, shortAddress } from '@utils/address';
import styles from './index.module.css';

/** Which ranking is showing. Pets is the default: it is the one with a pet in it. */
type Board = 'pets' | 'players';

/** Win rate as a percentage, or null when the row has no battles to divide by. */
function winRate(wins: number, losses: number): number | null {
    const fought = wins + losses;
    return fought === 0 ? null : Math.round((wins / fought) * 100);
}

/** Medal for the top three, plain number below. Rank is absolute, so this holds on page 2+. */
function rankBadge(rank: number): string {
    return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
}

/**
 * One ranked row. Both boards render the same five tracks — only the avatar, the title
 * and the sub-line differ — so they share this rather than two near-identical components
 * that would drift the first time the record column is edited.
 */
const Row: React.FC<{
    rank: number;
    avatar: ReactNode;
    title: ReactNode;
    sub: ReactNode;
    winCount: number;
    lossCount: number;
    isYou: boolean;
}> = ({ rank, avatar, title, sub, winCount, lossCount, isYou }) => {
    const rate = winRate(winCount, lossCount);
    return (
        <li className={isYou ? `${styles.row} ${styles.isYou}` : styles.row}>
            <span className={styles.rank}>{rankBadge(rank)}</span>
            <span className={styles.avatar} aria-hidden>
                {avatar}
            </span>
            <span className={styles.name}>
                {title}
                <span className={styles.sub}>{sub}</span>
            </span>
            <span className={styles.record}>
                <span className={styles.wins}>{winCount}W</span>
                <span className={styles.losses}>{lossCount}L</span>
            </span>
            <span className={styles.rate}>{rate == null ? '—' : `${rate}%`}</span>
        </li>
    );
};

/**
 * Page numbers to render, with `null` standing for a gap.
 *
 * The ends and the current page's neighbours, so the strip stays a fixed width however
 * long the board grows: page 1 and the last page are always reachable in one press, which
 * is what people actually jump to.
 */
function pageSlots(page: number, lastPage: number): (number | null)[] {
    if (lastPage <= 6) return Array.from({ length: lastPage + 1 }, (_, index) => index);

    const wanted = [0, lastPage, page - 1, page, page + 1];
    const shown = [...new Set(wanted)].filter((n) => n >= 0 && n <= lastPage).sort((a, b) => a - b);

    return shown.flatMap((n, index) => {
        const previous = shown[index - 1];
        if (previous === undefined || n - previous === 1) return [n];
        // A gap of exactly one is written out rather than elided: an ellipsis costs the
        // same space as the single number it would hide.
        return n - previous === 2 ? [n - 1, n] : [null, n];
    });
}

/**
 * The range summary and page controls.
 *
 * The summary shows even on a single page. Hiding the whole thing when everything fits —
 * which is what this did — leaves a reader unable to tell a short board from a truncated
 * one, and makes the feature look absent right up until the day it matters.
 */
const Pager: React.FC<{
    page: number;
    lastPage: number;
    pageSize: number;
    total: number;
    onGo: (page: number) => void;
}> = ({ page, lastPage, pageSize, total, onGo }) => {
    const first = page * pageSize + 1;
    const last = Math.min(total, (page + 1) * pageSize);

    return (
        <div className={styles.pager}>
            <span className={styles.pageLabel}>
                {first}–{last} of {total}
            </span>

            {lastPage > 0 && (
                <nav className={styles.pageNav} aria-label="Leaderboard pages">
                    <button type="button" onClick={() => onGo(page - 1)} disabled={page === 0}>
                        ←
                    </button>
                    {pageSlots(page, lastPage).map((slot, index) =>
                        slot === null ? (
                            <span key={`gap-${index}`} className={styles.pageGap} aria-hidden>
                                …
                            </span>
                        ) : (
                            <button
                                key={slot}
                                type="button"
                                className={slot === page ? styles.isCurrent : undefined}
                                aria-current={slot === page ? 'page' : undefined}
                                aria-label={`Page ${slot + 1}`}
                                onClick={() => onGo(slot)}
                            >
                                {slot + 1}
                            </button>
                        ),
                    )}
                    <button
                        type="button"
                        onClick={() => onGo(page + 1)}
                        disabled={page >= lastPage}
                    >
                        →
                    </button>
                </nav>
            )}
        </div>
    );
};

/**
 * Leaderboard view: pets ranked by battle record, and their owners ranked by the same
 * record summed.
 *
 * A read-only page rather than an interaction panel — nothing here selects a pet or
 * signs anything, so it composes `DashboardPanel` directly instead of going through
 * `InteractionStandalone`.
 *
 * Ranking is entirely the backend's. It ranks over the merged record
 * (`pet_battle_progress` above the frozen `pet_roster` counters) inside the query that
 * orders the rows, so this renders the page it is given and never re-sorts: a
 * client-side sort could only reorder rows the server already picked, which would
 * quietly disagree with `rank`.
 */
const Leaderboard: React.FC = () => {
    const navigate = useNavigate();
    const { activeKind, walletAddress } = useChainCapabilities();
    const [board, setBoard] = useState<Board>('pets');
    const [page, setPage] = useState(0);
    const [term, setTerm] = useState('');

    // 300 ms, matching `useSearchPets`: a round trip per keystroke against a ranked query
    // is a lot of work to throw away, and the board is not a typeahead.
    const [search, setSearch] = useState('');
    useEffect(() => {
        const id = setTimeout(() => setSearch(term.trim()), 300);
        return () => clearTimeout(id);
    }, [term]);

    // A term that narrows the board also renumbers which page anything is on, so the
    // reader has to be put back at the first one or a search can land on an empty page.
    useEffect(() => setPage(0), [search]);

    const pets = useLeaderboard({ chain: activeKind, page, search, enabled: board === 'pets' });
    const players = usePlayerLeaderboard({
        chain: activeKind,
        page,
        search,
        enabled: board === 'players',
    });

    const active = board === 'pets' ? pets : players;
    const goBack = () => navigate(DASHBOARD_HOME);
    const heading = (
        <>
            <Icon as={TrophyIcon} tone={Tones.Amber} />
            Leaderboard
        </>
    );

    // `sameAccount` normalizes by address shape, so this needs no chain branch and cannot
    // merge two Solana pubkeys that differ only in case.
    const isYou = (owner: string) => sameAccount(owner, walletAddress ?? '');

    const showBoard = (next: Board) => {
        setBoard(next);
        // Page 3 of the pet board says nothing about where a player sits, and the two
        // boards have different lengths. The term goes too: the boards search different
        // things — a pet's name and an owner's address — so carrying one across would
        // hand the other board a query that cannot match.
        setPage(0);
        setTerm('');
        setSearch('');
    };

    const lastPage = Math.max(0, Math.ceil(active.total / active.pageSize) - 1);

    return (
        <SessionGate
            title={heading}
            connectPrompt="Connect your wallet to see the rankings"
            signInPrompt="Sign in to see the rankings"
            tone="amber"
            back={goBack}
        >
            <DashboardPanel
                className={styles.page}
                title={heading}
                description="Ranked by wins, then by fewest losses"
                back={goBack}
            >
                <div className={styles.tabs} role="tablist" aria-label="Leaderboard type">
                    {(['pets', 'players'] as const).map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            role="tab"
                            aria-selected={board === tab}
                            className={board === tab ? `${styles.tab} ${styles.isActive}` : styles.tab}
                            onClick={() => showBoard(tab)}
                        >
                            {tab === 'pets' ? 'Pets' : 'Players'}
                        </button>
                    ))}
                </div>

                <div className={styles.search}>
                    <input
                        type="search"
                        value={term}
                        onChange={(event) => setTerm(event.target.value)}
                        placeholder={
                            board === 'pets' ? 'Search pets by name' : 'Search players by address'
                        }
                        aria-label={
                            board === 'pets' ? 'Search pets by name' : 'Search players by address'
                        }
                    />
                </div>

                {active.error ? (
                    <p className={styles.error}>{active.error.message}</p>
                ) : active.isLoading ? (
                    <div className="loading-container">
                        <div className="loading-spinner" />
                    </div>
                ) : active.total === 0 ? (
                    <p className={styles.empty}>
                        {search
                            ? `Nothing on the board matches "${search}".`
                            : 'No battles on record yet. Win one and the board fills up.'}
                    </p>
                ) : (
                    <>
                        <ol className={styles.list}>
                            {board === 'pets'
                                ? pets.entries.map((entry) => (
                                      <Row
                                          key={entry.id}
                                          rank={entry.rank}
                                          avatar={
                                              <PetArt
                                                  pet={{
                                                      id: entry.id,
                                                      chain: entry.chain,
                                                      assetKey: entry.asset || undefined,
                                                      dna: BigInt(entry.dna),
                                                      name: entry.name,
                                                  }}
                                              />
                                          }
                                          title={entry.name}
                                          sub={`Lv ${entry.level}`}
                                          winCount={entry.winCount}
                                          lossCount={entry.lossCount}
                                          isYou={isYou(entry.owner)}
                                      />
                                  ))
                                : players.entries.map((entry) => (
                                      <Row
                                          key={entry.owner}
                                          rank={entry.rank}
                                          avatar="👤"
                                          title={shortAddress(entry.owner)}
                                          sub={`${entry.petCount} pet${entry.petCount === 1 ? '' : 's'}`}
                                          winCount={entry.winCount}
                                          lossCount={entry.lossCount}
                                          isYou={isYou(entry.owner)}
                                      />
                                  ))}
                        </ol>

                        <Pager
                            page={page}
                            lastPage={lastPage}
                            pageSize={active.pageSize}
                            total={active.total}
                            onGo={setPage}
                        />
                    </>
                )}
            </DashboardPanel>
        </SessionGate>
    );
};

export default Leaderboard;
