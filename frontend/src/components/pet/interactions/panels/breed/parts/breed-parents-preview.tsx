import React from 'react';
import {
    getLifePercent,
    getPetAvatar,
    getPetClass,
    getPetProperties,
    getRarityColor,
    getRarityName,
    getXpNumbers,
    getXpPercent,
    type Pet,
} from '@shared/core';
import BreedDnaCenter from './breed-dna-center';

type BreedParentsPreviewProps = {
    petA: Pet | null;
    petB: Pet | null;
};

/** Four real DNA-backed stats. AGI has no backing in the data model, so we keep
 *  the gallery's STR / INT / DEF / VIT set rather than the mock's STR/AGI/INT/DEF. */
const STAT_ROWS = [
    { label: 'STR', key: 'attack', color: '#ff7bcb' },
    { label: 'INT', key: 'intelligence', color: '#b58cff' },
    { label: 'DEF', key: 'defense', color: '#7dd6ff' },
    { label: 'VIT', key: 'life', color: '#0fffae' },
] as const;

const winRatio = (pet: Pet): number => {
    const total = pet.winCount + pet.lossCount;
    return total === 0 ? 0 : Math.round((pet.winCount / total) * 100);
};

const ParentCard: React.FC<{ pet: Pet | null; side: 'a' | 'b' }> = ({ pet, side }) => {
    if (!pet) {
        return (
            <div className={`breed-parent breed-parent--${side} is-empty`}>
                <div className="breed-parent__placeholder">Select a parent</div>
            </div>
        );
    }
    const props = getPetProperties(pet);
    const rarityColor = getRarityColor(pet.rarity);
    const xp = getXpNumbers(pet);
    const hp = getLifePercent(pet);

    return (
        <div className={`breed-parent breed-parent--${side}`}>
            <div className="breed-parent__visual">
                <div
                    className="breed-parent__rarity"
                    style={{ color: rarityColor, borderColor: rarityColor }}
                >
                    {getRarityName(pet.rarity)}
                </div>
                <div className="breed-parent__level">Lv.{pet.level}</div>
                {pet.breedCount != null && (
                    <div className="breed-parent__bred">{pet.breedCount} bred</div>
                )}
                <span className="breed-parent__avatar">{getPetAvatar(pet.dna)}</span>
            </div>

            <div className="breed-parent__body">
                <div className="breed-parent__name">{pet.name}</div>
                <div className="breed-parent__class">{getPetClass(pet.dna)}</div>

                <div className="breed-parent__stats">
                    {STAT_ROWS.map((row) => {
                        const value = props[row.key];
                        return (
                            <div className="breed-parent__stat" key={row.label}>
                                <span
                                    className="breed-parent__stat-label"
                                    style={{ color: row.color }}
                                >
                                    {row.label}
                                </span>
                                <span className="breed-parent__stat-value">{value}</span>
                                <div className="breed-parent__stat-track">
                                    <div
                                        className="breed-parent__stat-fill"
                                        style={{
                                            width: `${Math.min(100, value)}%`,
                                            background: row.color,
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="breed-parent__meters">
                    <div className="breed-parent__meter">
                        <span className="breed-parent__meter-label breed-parent__meter-label--xp">
                            XP
                        </span>
                        <div className="breed-parent__meter-track">
                            <div
                                className="breed-parent__meter-fill breed-parent__meter-fill--xp"
                                style={{ width: `${getXpPercent(pet)}%` }}
                            />
                        </div>
                        <span className="breed-parent__meter-value breed-parent__meter-value--xp">
                            {xp.xpCurrent}/{xp.xpMax}
                        </span>
                    </div>
                    <div className="breed-parent__meter">
                        <span className="breed-parent__meter-label breed-parent__meter-label--hp">
                            HP
                        </span>
                        <div className="breed-parent__meter-track">
                            <div
                                className="breed-parent__meter-fill breed-parent__meter-fill--hp"
                                style={{ width: `${hp}%` }}
                            />
                        </div>
                        <span className="breed-parent__meter-value breed-parent__meter-value--hp">
                            {hp}%
                        </span>
                    </div>
                </div>

                <div className="breed-parent__record">
                    <span>
                        {pet.winCount}W / {pet.lossCount}L
                    </span>
                    <span className="breed-parent__wr">{winRatio(pet)}% WR</span>
                </div>
            </div>
        </div>
    );
};

/** Offspring trait prediction — for each stat, shows both parents' values, the
 *  estimated inherited range (offspring falls between the parents), and which
 *  parent is dominant. Estimate only; the contract decides the true result. */
const TraitPrediction: React.FC<{ petA: Pet; petB: Pet }> = ({ petA, petB }) => {
    const a = getPetProperties(petA);
    const b = getPetProperties(petB);
    return (
        <div className="breed-traits">
            <div className="breed-traits__title">🧬 Offspring Trait Prediction</div>
            <div className="breed-traits__grid">
                {STAT_ROWS.map((row) => {
                    const valA = a[row.key];
                    const valB = b[row.key];
                    const lo = Math.min(valA, valB);
                    const hi = Math.max(valA, valB);
                    const aDominant = valA >= valB;
                    return (
                        <div className="breed-trait" key={row.label}>
                            <div className="breed-trait__label" style={{ color: row.color }}>
                                {row.label}
                            </div>
                            <div className="breed-trait__vs">
                                <span className="breed-trait__val breed-trait__val--a">{valA}</span>
                                <span className="breed-trait__sep">vs</span>
                                <span className="breed-trait__val breed-trait__val--b">{valB}</span>
                            </div>
                            <div
                                className="breed-trait__range"
                                style={{ color: aDominant ? '#7dd6ff' : '#ff7bcb' }}
                            >
                                → {lo}–{hi}
                            </div>
                            <div className="breed-trait__dom">
                                {aDominant ? 'Parent A' : 'Parent B'} dominant
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

/** Parent A · 🥚 · Parent B preview for the breed panel, plus the offspring
 *  trait prediction once both parents are chosen — all from real pet stats. */
const BreedParentsPreview: React.FC<BreedParentsPreviewProps> = ({ petA, petB }) => (
    <>
        <div className="breed-parents">
            <ParentCard pet={petA} side="a" />
            <BreedDnaCenter petA={petA} petB={petB} />
            <ParentCard pet={petB} side="b" />
        </div>
        {petA && petB && <TraitPrediction petA={petA} petB={petB} />}
    </>
);

export default BreedParentsPreview;
