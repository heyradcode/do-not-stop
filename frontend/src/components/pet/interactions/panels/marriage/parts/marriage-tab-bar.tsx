import React from 'react';
import clsx from 'clsx';
import type { MarriageTab } from '../types';
import s from '../index.module.css';

type MarriageTabBarProps = {
    tab: MarriageTab;
    onChange: (tab: MarriageTab) => void;
    proposalCount: number;
};

/** Propose / Accept switcher with a badge for pending incoming proposals. */
const MarriageTabBar: React.FC<MarriageTabBarProps> = ({ tab, onChange, proposalCount }) => (
    <div className={s.tabs}>
        <button
            type="button"
            className={clsx(s.tab, tab === 'propose' && s.active)}
            onClick={() => onChange('propose')}
        >
            💍 Propose
        </button>
        <button
            type="button"
            className={clsx(s.tab, tab === 'accept' && s.active)}
            onClick={() => onChange('accept')}
        >
            💒 Accept
            {proposalCount > 0 && <span className={s.tabBadge}>{proposalCount}</span>}
        </button>
    </div>
);

export default MarriageTabBar;
