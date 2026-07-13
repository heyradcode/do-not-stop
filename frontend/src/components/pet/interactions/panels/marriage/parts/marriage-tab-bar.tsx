import React from 'react';
import clsx from 'clsx';
import type { MarriageTab } from '../types';
import styles from '../index.module.css';

type MarriageTabBarProps = {
    tab: MarriageTab;
    onChange: (tab: MarriageTab) => void;
    proposalCount: number;
};

/** Propose / Accept switcher with a badge for pending incoming proposals. */
const MarriageTabBar: React.FC<MarriageTabBarProps> = ({ tab, onChange, proposalCount }) => (
    <div className={styles.tabs}>
        <button
            type="button"
            className={clsx(styles.tab, tab === 'propose' && styles.active)}
            onClick={() => onChange('propose')}
        >
            💍 Propose
        </button>
        <button
            type="button"
            className={clsx(styles.tab, tab === 'accept' && styles.active)}
            onClick={() => onChange('accept')}
        >
            💒 Accept
            {proposalCount > 0 && <span className={styles.tabBadge}>{proposalCount}</span>}
        </button>
    </div>
);

export default MarriageTabBar;
