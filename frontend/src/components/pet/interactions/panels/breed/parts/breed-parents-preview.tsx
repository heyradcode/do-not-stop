import React from 'react';
import { getPetAvatar, getPetClass, getPetProperties, type Pet } from '@shared/core';

type BreedParentsPreviewProps = {
    petA: Pet | null;
    petB: Pet | null;
};

const STAT_ROWS = [
    { label: 'STR', key: 'attack', color: '#ff7bcb' },
    { label: 'INT', key: 'intelligence', color: '#b58cff' },
    { label: 'DEF', key: 'defense', color: '#7dd6ff' },
    { label: 'VIT', key: 'life', color: '#0fffae' },
] as const;

const ParentCard: React.FC<{ pet: Pet | null; side: 'a' | 'b' }> = ({ pet, side }) => {
    if (!pet) {
        return (
            <div className={`breed-parent breed-parent--${side} is-empty`}>
                <div className="breed-parent__placeholder">Select a parent</div>
            </div>
        );
    }
    const props = getPetProperties(pet);
    return (
        <div className={`breed-parent breed-parent--${side}`}>
            <div className="breed-parent__head">
                <span className="breed-parent__avatar">{getPetAvatar(pet.dna)}</span>
                <div className="breed-parent__meta">
                    <div className="breed-parent__name">{pet.name}</div>
                    <div className="breed-parent__class">
                        {getPetClass(pet.dna)} · Lv.{pet.level}
                    </div>
                </div>
            </div>
            <div className="breed-parent__stats">
                {STAT_ROWS.map((row) => {
                    const value = props[row.key];
                    return (
                        <div className="breed-parent__stat" key={row.label}>
                            <span className="breed-parent__stat-label" style={{ color: row.color }}>
                                {row.label}
                            </span>
                            <div className="breed-parent__stat-track">
                                <div
                                    className="breed-parent__stat-fill"
                                    style={{
                                        width: `${Math.min(100, value)}%`,
                                        background: row.color,
                                    }}
                                />
                            </div>
                            <span className="breed-parent__stat-value">{value}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

/** Parent A · 🥚 · Parent B preview for the breed panel, from real pet stats. */
const BreedParentsPreview: React.FC<BreedParentsPreviewProps> = ({ petA, petB }) => (
    <div className="breed-parents">
        <ParentCard pet={petA} side="a" />
        <div className="breed-parents__egg" aria-hidden>
            🥚
        </div>
        <ParentCard pet={petB} side="b" />
    </div>
);

export default BreedParentsPreview;
