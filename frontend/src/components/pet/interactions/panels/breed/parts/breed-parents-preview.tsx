import React from 'react';
import clsx from 'clsx';
import {
    getLifePercent,
    getPetClass,
    getPetProperties,
    getRarityColor,
    getRarityName,
    getXpNumbers,
    getXpPercent,
    type Pet,
} from '@shared/core';
import BreedDnaCenter from './breed-dna-center';
import styles from '../index.module.css';
import PetArt from '@components/pet/pet-art';

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
        <div className={styles.cycle}>
            <button
                type="button"
                className={clsx(styles.cycleBtn, side === 'a' ? styles.cycleBtnA : styles.cycleBtnB)}
                onClick={onPrev}
            >
                ◀ Prev
            </button>
            <button
                type="button"
                className={clsx(styles.cycleBtn, side === 'a' ? styles.cycleBtnA : styles.cycleBtnB)}
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
            <div className={clsx(styles.parent, side === 'b' && styles.parentB, styles.isEmpty)}>
                <div className={styles.parentPlaceholder}>Select a parent</div>
            </div>
        );
    }
    const props = getPetProperties(pet);
    const rarityColor = getRarityColor(pet.rarity);
    const xp = getXpNumbers(pet);
    const hp = getLifePercent(pet);

    return (
        <div className={clsx(styles.parent, side === 'b' && styles.parentB)}>
            <div className={styles.parentVisual}>
                <div
                    className={styles.parentRarity}
                    style={{ color: rarityColor, borderColor: rarityColor }}
                >
                    {getRarityName(pet.rarity)}
                </div>
                <div className={styles.parentLevel}>Lv.{pet.level}</div>
                {pet.breedCount != null && (
                    <div className={styles.parentBred}>{pet.breedCount} bred</div>
                )}
                <span className={styles.parentAvatar}><PetArt pet={pet} /></span>
            </div>

            <div className={styles.parentBody}>
                <div className={styles.parentName}>{pet.name}</div>
                <div className={styles.parentClass}>{getPetClass(pet.dna)}</div>

                <div className={styles.parentStats}>
                    {STAT_ROWS.map((row) => {
                        const value = props[row.key];
                        return (
                            <div className={styles.parentStat} key={row.label}>
                                <span
                                    className={styles.parentStatLabel}
                                    style={{ color: row.color }}
                                >
                                    {row.label}
                                </span>
                                <span className={styles.parentStatValue}>{value}</span>
                                <div className={styles.parentStatTrack}>
                                    <div
                                        className={styles.parentStatFill}
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

                <div className={styles.parentMeters}>
                    <div className={styles.parentMeter}>
                        <span className={clsx(styles.parentMeterLabel, styles.parentMeterLabelXp)}>
                            XP
                        </span>
                        <div className={styles.parentMeterTrack}>
                            <div
                                className={clsx(styles.parentMeterFill, styles.parentMeterFillXp)}
                                style={{ width: `${getXpPercent(pet)}%` }}
                            />
                        </div>
                        <span className={clsx(styles.parentMeterValue, styles.parentMeterValueXp)}>
                            {xp.xpCurrent}/{xp.xpMax}
                        </span>
                    </div>
                    <div className={styles.parentMeter}>
                        <span className={clsx(styles.parentMeterLabel, styles.parentMeterLabelHp)}>
                            HP
                        </span>
                        <div className={styles.parentMeterTrack}>
                            <div
                                className={clsx(styles.parentMeterFill, styles.parentMeterFillHp)}
                                style={{ width: `${hp}%` }}
                            />
                        </div>
                        <span className={clsx(styles.parentMeterValue, styles.parentMeterValueHp)}>
                            {hp}%
                        </span>
                    </div>
                </div>

                <div className={styles.parentRecord}>
                    <span>
                        {pet.winCount}W / {pet.lossCount}L
                    </span>
                    <span className={styles.parentWr}>{winRatio(pet)}% WR</span>
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
    <div className={styles.parents}>
        <div className={styles.parentCol}>
            <ParentCard pet={petA} side="a" />
            <CycleRow side="a" onPrev={onPrevA} onNext={onNextA} />
        </div>
        <BreedDnaCenter petA={petA} petB={petB} action={action} />
        <div className={styles.parentCol}>
            <ParentCard pet={petB} side="b" />
            <CycleRow side="b" onPrev={onPrevB} onNext={onNextB} />
        </div>
    </div>
);

export default BreedParentsPreview;
