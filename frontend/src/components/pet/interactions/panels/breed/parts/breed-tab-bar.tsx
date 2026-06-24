import React from 'react';
import type { BreedTab } from '../types';

type BreedTabBarProps = {
    tab: BreedTab;
    onChange: (tab: BreedTab) => void;
};

/** My Pets / With Spouse switcher. */
const BreedTabBar: React.FC<BreedTabBarProps> = ({ tab, onChange }) => (
    <div className="breed-tabs">
        <button
            type="button"
            className={`breed-tab${tab === 'own' ? ' active' : ''}`}
            onClick={() => onChange('own')}
        >
            🐾 My Pets
        </button>
        <button
            type="button"
            className={`breed-tab spouse-tab${tab === 'spouse' ? ' active' : ''}`}
            onClick={() => onChange('spouse')}
        >
            💍 With Spouse
        </button>
    </div>
);

export default BreedTabBar;
