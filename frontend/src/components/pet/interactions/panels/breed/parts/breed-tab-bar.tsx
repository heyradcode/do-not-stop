import React from 'react';
import clsx from 'clsx';
import type { BreedTab } from '../types';
import styles from '../index.module.css';

type BreedTabBarProps = {
    tab: BreedTab;
    onChange: (tab: BreedTab) => void;
};

/** My Pets / With Spouse switcher. */
const BreedTabBar: React.FC<BreedTabBarProps> = ({ tab, onChange }) => (
    <div className={styles.tabs}>
        <button
            type="button"
            className={clsx(styles.tab, tab === 'own' && styles.active)}
            onClick={() => onChange('own')}
        >
            🐾 My Pets
        </button>
        <button
            type="button"
            className={clsx(styles.tab, styles.spouseTab, tab === 'spouse' && styles.active)}
            onClick={() => onChange('spouse')}
        >
            💍 With Spouse
        </button>
    </div>
);

export default BreedTabBar;
