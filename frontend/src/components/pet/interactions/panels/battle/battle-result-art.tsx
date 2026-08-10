import React from 'react';
import type { BattleOutcome } from '@shared/core';

type Props = { outcome: BattleOutcome };

const PendingArt: React.FC = () => (
    <svg viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line
            x1="22"
            y1="14"
            x2="98"
            y2="66"
            stroke="#7dd6ff"
            strokeWidth="3"
            strokeLinecap="round"
        />
        <line
            x1="98"
            y1="14"
            x2="22"
            y2="66"
            stroke="#7dd6ff"
            strokeWidth="3"
            strokeLinecap="round"
        />
        <circle cx="60" cy="40" r="6" fill="rgb(125 214 255 / 30%)" />
        <circle cx="60" cy="40" r="3" fill="#7dd6ff" />
        <circle cx="22" cy="14" r="3" fill="rgb(125 214 255 / 55%)" />
        <circle cx="98" cy="14" r="3" fill="rgb(125 214 255 / 55%)" />
        <circle cx="22" cy="66" r="3" fill="rgb(125 214 255 / 55%)" />
        <circle cx="98" cy="66" r="3" fill="rgb(125 214 255 / 55%)" />
    </svg>
);

const VictoryArt: React.FC = () => (
    <svg viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M22 62 L22 36 L36 50 L60 18 L84 50 L98 36 L98 62 Z"
            fill="rgb(0 255 157 / 16%)"
            stroke="#0fffae"
            strokeWidth="2.5"
            strokeLinejoin="round"
        />
        <rect
            x="16"
            y="62"
            width="88"
            height="10"
            rx="3"
            fill="rgb(0 255 157 / 18%)"
            stroke="#0fffae"
            strokeWidth="2"
        />
        <circle cx="60" cy="44" r="5" fill="#0fffae" opacity="0.9" />
        <circle cx="38" cy="53" r="3.5" fill="rgb(0 255 157 / 65%)" />
        <circle cx="82" cy="53" r="3.5" fill="rgb(0 255 157 / 65%)" />
        <circle cx="16" cy="16" r="2.5" fill="#9effd4" opacity="0.7" />
        <circle cx="104" cy="20" r="2.5" fill="#9effd4" opacity="0.7" />
        <circle cx="60" cy="6" r="2" fill="#9effd4" opacity="0.8" />
        <circle cx="10" cy="42" r="1.5" fill="#9effd4" opacity="0.5" />
        <circle cx="110" cy="38" r="1.5" fill="#9effd4" opacity="0.5" />
    </svg>
);

const DefeatArt: React.FC = () => (
    <svg viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M60 8 L92 24 L92 50 Q92 70 60 76 Q28 70 28 50 L28 24 Z"
            fill="rgb(255 110 196 / 10%)"
            stroke="#ff9ad6"
            strokeWidth="2.5"
            strokeLinejoin="round"
        />
        <path
            d="M54 18 L62 36 L57 44 L66 62"
            stroke="#ff9ad6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <circle
            cx="46"
            cy="38"
            r="5"
            fill="rgb(255 110 196 / 22%)"
            stroke="#ff9ad6"
            strokeWidth="1.5"
        />
        <circle
            cx="74"
            cy="38"
            r="5"
            fill="rgb(255 110 196 / 22%)"
            stroke="#ff9ad6"
            strokeWidth="1.5"
        />
        <circle cx="16" cy="14" r="2" fill="rgb(255 110 196 / 45%)" />
        <circle cx="104" cy="18" r="2" fill="rgb(255 110 196 / 45%)" />
        <circle cx="12" cy="46" r="1.5" fill="rgb(255 110 196 / 35%)" />
        <circle cx="108" cy="42" r="1.5" fill="rgb(255 110 196 / 35%)" />
    </svg>
);

const BattleResultArt: React.FC<Props> = ({ outcome }) => {
    if (outcome === null) return <PendingArt />;
    if (outcome.result === 'victory') return <VictoryArt />;
    return <DefeatArt />;
};

export default BattleResultArt;
