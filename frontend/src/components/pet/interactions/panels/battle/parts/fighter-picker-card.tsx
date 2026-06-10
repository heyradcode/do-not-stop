import React from 'react';
import { getPetAvatar, getRarityColor, getRarityName, type Pet } from '@shared/core';

type FighterPickerCardProps = {
    pet: Pet;
    petId: string;
    selected: boolean;
    onSelect: (petId: string) => void;
};

/** Selectable card for one of the player's own ready fighters. */
const FighterPickerCard: React.FC<FighterPickerCardProps> = ({ pet, petId, selected, onSelect }) => (
    <button
        type="button"
        className={`battle-picker-card${selected ? ' is-selected' : ''}`}
        aria-pressed={selected}
        onClick={() => onSelect(petId)}
    >
        <div className="card-top">
            <span className="card-avatar" aria-hidden>
                {getPetAvatar(pet.dna)}
            </span>
            <div className="card-body">
                <span className="card-name">{pet.name}</span>
                <span className="card-meta">Lv.{pet.level}</span>
            </div>
        </div>
        <div className="card-stats">
            <span className="stat-pill rarity" style={{ backgroundColor: getRarityColor(pet.rarity) }}>
                {getRarityName(pet.rarity)}
            </span>
            <span className="stat-pill">
                {pet.winCount}W / {pet.lossCount}L
            </span>
        </div>
    </button>
);

export default FighterPickerCard;
