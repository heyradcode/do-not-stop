import React from 'react';
import clsx from 'clsx';
import type { BreedTab } from '../types';
import s from '../index.module.css';

type BreedTabBarProps = {
    tab: BreedTab;
    onChange: (tab: BreedTab) => void;
};

/** My Pets / With Spouse switcher. */
const BreedTabBar: React.FC<BreedTabBarProps> = ({ tab, onChange }) => (
    <div className={s.tabs}>
        <button
            type="button"
            className={clsx(s.tab, tab === 'own' && s.active)}
            onClick={() => onChange('own')}
        >
            🐾 My Pets
        </button>
        <button
            type="button"
            className={clsx(s.tab, s.spouseTab, tab === 'spouse' && s.active)}
            onClick={() => onChange('spouse')}
        >
            💍 With Spouse
        </button>
    </div>
);

export default BreedTabBar;
