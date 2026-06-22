import React from 'react';
import { getPetAvatar, getRarityColor, getRarityName, type OpponentPet } from '@shared/core';
import { getLevelDelta, getMatchLabel, getMatchTier } from '../battle-matchmaking';
import { opponentKey, shortAddress } from '../battle-utils';

type OpponentPickerCardProps = {
    opponent: OpponentPet;
    fighterLevel: number | null;
    selected: boolean;
    onSelect: (key: string) => void;
    cardRef?: React.Ref<HTMLButtonElement>;
};

/** Selectable card for a challenger, tagged with a level-match tier. */
const OpponentPickerCard: React.FC<OpponentPickerCardProps> = ({
    opponent,
    fighterLevel,
    selected,
    onSelect,
    cardRef,
}) => {
    const key = opponentKey(opponent.owner, opponent.id);
    const levelDelta = getLevelDelta(fighterLevel, opponent.level);
    const matchTier = getMatchTier(levelDelta);
    const matchLabel = getMatchLabel(matchTier, levelDelta);

    return (
        <button
            ref={cardRef}
            type="button"
            className={`battle-picker-card${selected ? ' is-selected' : ''}${
                matchTier !== 'unknown' ? ` match-${matchTier}` : ''
            }`}
            aria-pressed={selected}
            onClick={() => onSelect(key)}
        >
            <div className="card-top">
                <span className="card-avatar" aria-hidden>
                    {getPetAvatar(opponent.dna)}
                </span>
                <div className="card-body">
                    <span className="card-name">{opponent.name}</span>
                    <span className="card-meta">
                        Lv.{opponent.level} · {shortAddress(opponent.owner)}
                    </span>
                </div>
            </div>
            <div className="card-stats">
                {matchLabel ? (
                    <span className={`stat-pill match-${matchTier}`}>{matchLabel}</span>
                ) : null}
                <span
                    className="stat-pill rarity"
                    style={{ backgroundColor: getRarityColor(opponent.rarity) }}
                >
                    {getRarityName(opponent.rarity)}
                </span>
                <span className="stat-pill">
                    {opponent.winCount}W / {opponent.lossCount}L
                </span>
            </div>
        </button>
    );
};

export default OpponentPickerCard;
