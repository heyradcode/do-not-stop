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
    /** Breed action button, rendered in the DNA centre between the two pets. */
    action?: React.ReactNode;
    /** Cycle controls under each parent card (Prev / Next). */
    onPrevA?: () => void;
    onNextA?: () => void;
    onPrevB?: () => void;
    onNextB?: () => void;
};

/** ◀ Prev / Next ▶ cycle row under a parent card. */
const CycleRow: React.FC<{ side: 'a' | 'b'; onPrev?: () => void; onNext?: () => void }> = ({
    side,
    onPrev,
    onNext,
}) => {
    if (!onPrev && !onNext) return null;
    return (
        <div className="breed-cycle">
            <button
                type="button"
                className={`breed-cycle__btn breed-cycle__btn--${side}`}
                onClick={onPrev}
            >
                ◀ Prev
            </button>
            <button
                type="button"
                className={`breed-cycle__btn breed-cycle__btn--${side}`}
                onClick={onNext}
            >
                Next ▶
            </button>
        </div>
    );
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

/** Parent A · 🥚 · Parent B preview for the breed panel — all from real pet
 *  stats. The breed action button sits in the DNA centre between the two pets. */
const BreedParentsPreview: React.FC<BreedParentsPreviewProps> = ({
    petA,
    petB,
    action,
    onPrevA,
    onNextA,
    onPrevB,
    onNextB,
}) => (
    <div className="breed-parents">
        <div className="breed-parent-col">
            <ParentCard pet={petA} side="a" />
            <CycleRow side="a" onPrev={onPrevA} onNext={onNextA} />
        </div>
        <BreedDnaCenter petA={petA} petB={petB} action={action} />
        <div className="breed-parent-col">
            <ParentCard pet={petB} side="b" />
            <CycleRow side="b" onPrev={onPrevB} onNext={onNextB} />
        </div>
    </div>
);

export default BreedParentsPreview;
