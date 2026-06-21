import React, { useMemo } from 'react';
import { useChainCapabilities, usePetList } from '@shared/core';

import AccountDropdown from '@components/wallet/account-dropdown';
import './index.css';

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
        <header className="cp-topbar">
            <div className="cp-topbar__title">{TITLE}</div>
            <div className="cp-topbar__spacer" />

            {isConnected && (
                <div className="cp-topbar__badges">
                    {/* Placeholder — player tier/level (no progression data yet) */}
                    <div className="cp-badge cp-badge--gold">
                        <span aria-hidden>🥇</span>
                        <span className="cp-badge__strong">GOLD</span>
                        <span className="cp-badge__sep" />
                        <span className="cp-badge__muted">Lv 24</span>
                    </div>
                    {/* Placeholder — win streak */}
                    <div className="cp-badge cp-badge--streak">
                        <span aria-hidden>🔥</span>
                        <span className="cp-badge__strong">7 STREAK</span>
                    </div>
                    {/* Real — total wins across owned pets */}
                    <div className="cp-badge cp-badge--wins">
                        <span aria-hidden>⚔</span>
                        <span>{totalWins} Wins</span>
                    </div>
                </div>
            )}

            <div className="cp-topbar__wallet">
                <AccountDropdown />
            </div>
        </header>
    );
};

export default TopBar;
