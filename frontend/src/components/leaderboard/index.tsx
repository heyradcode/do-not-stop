import React, { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    useChainCapabilities,
    useLeaderboard,
    usePlayerLeaderboard,
} from '@shared/core';

import DashboardPanel from '@components/common/dashboard-panel';
import StateCard from '@components/pet/interactions/state-card';
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
    const { isConnected, activeKind, walletAddress } = useChainCapabilities();
    const [board, setBoard] = useState<Board>('pets');
    const [page, setPage] = useState(0);

    const pets = useLeaderboard({ chain: activeKind, page, enabled: board === 'pets' });
    const players = usePlayerLeaderboard({
        chain: activeKind,
        page,
        enabled: board === 'players',
    });

    const active = board === 'pets' ? pets : players;
    const goBack = () => navigate(DASHBOARD_HOME);

    if (!isConnected) {
        return (
            <StateCard
                // The literal class is load-bearing: StateCard centers the description
                // only when it sees this name, matching every other disconnected screen.
                containerClassName="wallet-disconnected"
                title={
                    <>
                        <Icon as={TrophyIcon} tone={Tones.Amber} />
                        Leaderboard
                    </>
                }
                description="Connect your wallet to see the rankings"
                back={goBack}
            />
        );
    }

    // `sameAccount` normalizes by address shape, so this needs no chain branch and cannot
    // merge two Solana pubkeys that differ only in case.
    const isYou = (owner: string) => sameAccount(owner, walletAddress ?? '');

    const showBoard = (next: Board) => {
        setBoard(next);
        // Page 3 of the pet board says nothing about where a player sits, and the two
        // boards have different lengths.
        setPage(0);
    };

    const lastPage = Math.max(0, Math.ceil(active.total / active.pageSize) - 1);

    return (
        <DashboardPanel
            className={styles.page}
            title={
                <>
                    <Icon as={TrophyIcon} tone={Tones.Amber} />
                    Leaderboard
                </>
            }
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

            {active.error ? (
                <p className={styles.error}>{active.error.message}</p>
            ) : active.isLoading ? (
                <div className="loading-container">
                    <div className="loading-spinner" />
                </div>
            ) : active.total === 0 ? (
                <p className={styles.empty}>
                    No battles on record yet. Win one and the board fills up.
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

                    {lastPage > 0 && (
                        <div className={styles.pager}>
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.max(0, p - 1))}
                                disabled={page === 0}
                            >
                                ← Prev
                            </button>
                            <span className={styles.pageLabel}>
                                Page {page + 1} of {lastPage + 1}
                            </span>
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                                disabled={page >= lastPage}
                            >
                                Next →
                            </button>
                        </div>
                    )}
                </>
            )}
        </DashboardPanel>
    );
};

export default Leaderboard;
