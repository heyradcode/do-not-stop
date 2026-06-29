import React, { useMemo } from 'react';
import clsx from 'clsx';
import { useChainCapabilities, usePetList } from '@shared/core';

import AccountDropdown from '@components/wallet/account-dropdown';
import s from './index.module.css';

const TITLE = 'Crypto Pets';

/**
 * Shell header: wordmark, player status badges, and the wallet control.
 *
 * Total wins is derived from the real pet list. The Gold tier / level and the
 * win-streak badges are static placeholders pending real progression data
 * (see FRONTEND_REDESIGN_PLAN.md §8 Q3).
 */
const TopBar: React.FC = () => {
    const { isConnected } = useChainCapabilities();
    const { pets } = usePetList();

    const totalWins = useMemo(
        () => pets.reduce((sum, pet) => sum + (pet.winCount ?? 0), 0),
        [pets],
    );

    return (
        <header className={s.topbar}>
            <div className={s.title}>{TITLE}</div>
            <div className={s.spacer} />

            {isConnected && (
                <div className={s.badges}>
                    {/* Placeholder — player tier/level (no progression data yet) */}
                    <div className={clsx(s.badge, s.gold)}>
                        <span aria-hidden>🥇</span>
                        <span className={s.strong}>GOLD</span>
                        <span className={s.sep} />
                        <span className={s.muted}>Lv 24</span>
                    </div>
                    {/* Placeholder — win streak */}
                    <div className={clsx(s.badge, s.streak)}>
                        <span aria-hidden>🔥</span>
                        <span className={s.strong}>7 STREAK</span>
                    </div>
                    {/* Real — total wins across owned pets */}
                    <div className={clsx(s.badge, s.wins)}>
                        <span aria-hidden>⚔</span>
                        <span>{totalWins} Wins</span>
                    </div>
                </div>
            )}

            <div className={s.wallet}>
                <AccountDropdown />
            </div>
        </header>
    );
};

export default TopBar;
