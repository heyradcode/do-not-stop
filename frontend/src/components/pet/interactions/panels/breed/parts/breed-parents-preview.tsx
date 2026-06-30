import React from 'react';
import clsx from 'clsx';
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
import s from '../index.module.css';

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
        <div className={s.cycle}>
            <button
                type="button"
                className={clsx(s.cycleBtn, side === 'a' ? s.cycleBtnA : s.cycleBtnB)}
                onClick={onPrev}
            >
                ◀ Prev
            </button>
            <button
                type="button"
                className={clsx(s.cycleBtn, side === 'a' ? s.cycleBtnA : s.cycleBtnB)}
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
            <div className={clsx(s.parent, side === 'b' && s.parentB, s.isEmpty)}>
                <div className={s.parentPlaceholder}>Select a parent</div>
            </div>
        );
    }
    const props = getPetProperties(pet);
    const rarityColor = getRarityColor(pet.rarity);
    const xp = getXpNumbers(pet);
    const hp = getLifePercent(pet);

    return (
        <div className={clsx(s.parent, side === 'b' && s.parentB)}>
            <div className={s.parentVisual}>
                <div
                    className={s.parentRarity}
                    style={{ color: rarityColor, borderColor: rarityColor }}
                >
                    {getRarityName(pet.rarity)}
                </div>
                <div className={s.parentLevel}>Lv.{pet.level}</div>
                {pet.breedCount != null && (
                    <div className={s.parentBred}>{pet.breedCount} bred</div>
                )}
                <span className={s.parentAvatar}>{getPetAvatar(pet.dna)}</span>
            </div>

            <div className={s.parentBody}>
                <div className={s.parentName}>{pet.name}</div>
                <div className={s.parentClass}>{getPetClass(pet.dna)}</div>

                <div className={s.parentStats}>
                    {STAT_ROWS.map((row) => {
                        const value = props[row.key];
                        return (
                            <div className={s.parentStat} key={row.label}>
                                <span
                                    className={s.parentStatLabel}
                                    style={{ color: row.color }}
                                >
                                    {row.label}
                                </span>
                                <span className={s.parentStatValue}>{value}</span>
                                <div className={s.parentStatTrack}>
                                    <div
                                        className={s.parentStatFill}
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

                <div className={s.parentMeters}>
                    <div className={s.parentMeter}>
                        <span className={clsx(s.parentMeterLabel, s.parentMeterLabelXp)}>
                            XP
                        </span>
                        <div className={s.parentMeterTrack}>
                            <div
                                className={clsx(s.parentMeterFill, s.parentMeterFillXp)}
                                style={{ width: `${getXpPercent(pet)}%` }}
                            />
                        </div>
                        <span className={clsx(s.parentMeterValue, s.parentMeterValueXp)}>
                            {xp.xpCurrent}/{xp.xpMax}
                        </span>
                    </div>
                    <div className={s.parentMeter}>
                        <span className={clsx(s.parentMeterLabel, s.parentMeterLabelHp)}>
                            HP
                        </span>
                        <div className={s.parentMeterTrack}>
                            <div
                                className={clsx(s.parentMeterFill, s.parentMeterFillHp)}
                                style={{ width: `${hp}%` }}
                            />
                        </div>
                        <span className={clsx(s.parentMeterValue, s.parentMeterValueHp)}>
                            {hp}%
                        </span>
                    </div>
                </div>

                <div className={s.parentRecord}>
                    <span>
                        {pet.winCount}W / {pet.lossCount}L
                    </span>
                    <span className={s.parentWr}>{winRatio(pet)}% WR</span>
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
    <div className={s.parents}>
        <div className={s.parentCol}>
            <ParentCard pet={petA} side="a" />
            <CycleRow side="a" onPrev={onPrevA} onNext={onNextA} />
        </div>
        <BreedDnaCenter petA={petA} petB={petB} action={action} />
        <div className={s.parentCol}>
            <ParentCard pet={petB} side="b" />
            <CycleRow side="b" onPrev={onPrevB} onNext={onNextB} />
        </div>
    </div>
);

export default BreedParentsPreview;
