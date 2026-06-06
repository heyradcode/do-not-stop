import React from 'react';
import { getLifePercent, getPetAvatar, type OpponentPet, type Pet } from '@shared/core';

type ArenaSlotProps = {
    pet?: Pet | OpponentPet | null;
    placeholder: string;
    ownerLabel?: string;
    side: 'fighter' | 'opponent';
    flash?: boolean;
};

/** One side of the VS arena — empty placeholder or the selected pet with a life bar. */
const ArenaSlot: React.FC<ArenaSlotProps> = ({ pet, placeholder, ownerLabel, side, flash }) => {
    if (!pet) {
        return (
            <div className={`arena-slot is-empty arena-slot-${side}`}>
                <span className="slot-placeholder">{placeholder}</span>
            </div>
        );
    }

    return (
        <div
            key={`${side}-${pet.id}`}
            className={`arena-slot is-selected arena-slot-${side}${flash ? ' is-flash' : ''}`}
        >
            <div className="slot-row">
                <span className="slot-avatar" aria-hidden>
                    {getPetAvatar(pet.dna)}
                </span>
                <div className="slot-meta">
                    <span className="slot-name">{pet.name}</span>
                    <span className="slot-sub">
                        Lv.{pet.level}
                        {ownerLabel ? ` · ${ownerLabel}` : ''}
                    </span>
                </div>
            </div>
            <div className="life-track" aria-hidden>
                <div className="life-fill" style={{ width: `${getLifePercent(pet)}%` }} />
            </div>
        </div>
    );
};

export default ArenaSlot;
