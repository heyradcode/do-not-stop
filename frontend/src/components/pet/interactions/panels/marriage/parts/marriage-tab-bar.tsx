import React from 'react';
import type { MarriageTab } from '../types';

type MarriageTabBarProps = {
    tab: MarriageTab;
    onChange: (tab: MarriageTab) => void;
    proposalCount: number;
};

/** Propose / Accept switcher with a badge for pending incoming proposals. */
const MarriageTabBar: React.FC<MarriageTabBarProps> = ({ tab, onChange, proposalCount }) => (
    <div className="marriage-tabs">
        <button
            type="button"
            className={`marriage-tab${tab === 'propose' ? ' active' : ''}`}
            onClick={() => onChange('propose')}
        >
            💍 Propose
        </button>
        <button
            type="button"
            className={`marriage-tab${tab === 'accept' ? ' active' : ''}`}
            onClick={() => onChange('accept')}
        >
            💒 Accept
            {proposalCount > 0 && <span className="marriage-tab-badge">{proposalCount}</span>}
        </button>
    </div>
);

export default MarriageTabBar;
