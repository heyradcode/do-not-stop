import React from 'react';
import {
    useMarriageInfo,
    useSpousePet,
    type OpponentPet,
    type Pet,
    type PetChain,
} from '@shared/core';
import { AuthActionButton } from '@components/common';
import PetArt from '@components/pet/pet-art';
import styles from '../index.module.css';

type MarriageCardProps = {
    pet: Pet;
    chain: PetChain | null;
    petById: Map<string, OpponentPet>;
    onDivorce: (petId: string) => void;
    busy: boolean;
};

/** Romantic marriage card — shows both pets connected by a heart. Renders nothing
 *  unless this pet is married. */
const MarriageCard: React.FC<MarriageCardProps> = ({ pet, chain, petById, onDivorce, busy }) => {
    const info = useMarriageInfo(pet);

    const spouseId = info.isMarried && info.spouseId ? info.spouseId.toString() : '';
    const fromMap = spouseId ? petById.get(spouseId) : undefined;

    // Direct no-debounce fallback: single pet(chain, id) query fires immediately
    // when the bulk allPets map doesn't have this pet yet.
    const fetched = useSpousePet(chain, spouseId, { skip: Boolean(fromMap) });

    if (!info.isMarried || !spouseId) return null;

    const spouseName = fromMap?.name ?? fetched.name ?? `#${spouseId}`;
    const spouseLevel = fromMap?.level ?? fetched.level;

    return (
        <li className={styles.card}>
            <div className={styles.pair}>
                <div className={styles.partnerSide}>
                    <span className={styles.partnerArt} aria-hidden>
                        <PetArt pet={pet} />
                    </span>
                    <div className={styles.partner}>
                        <span className={styles.partnerName}>{pet.name}</span>
                        <span className={styles.partnerMeta}>
                            #{pet.id} · Lv {pet.level}
                        </span>
                    </div>
                </div>
                <span className={styles.heart} aria-hidden>
                    ❤
                </span>
                <div className={styles.partnerSide}>
                    {/* Only the roster carries the spouse's dna, and so its art. The
                        single-pet fallback below returns a name and a level, which is
                        enough to identify the marriage but not to draw the pet. */}
                    {fromMap && (
                        <span className={styles.partnerArt} aria-hidden>
                            <PetArt pet={fromMap} />
                        </span>
                    )}
                    <div className={styles.partner}>
                        <span className={styles.partnerName}>{spouseName}</span>
                        <span className={styles.partnerMeta}>
                            #{spouseId}
                            {spouseLevel != null ? ` · Lv ${spouseLevel}` : ''}
                        </span>
                    </div>
                </div>
            </div>
            <AuthActionButton
                tone="magenta"
                size="xs"
                onClick={() => onDivorce(pet.id)}
                disabled={busy}
            >
                Divorce
            </AuthActionButton>
        </li>
    );
};

export default MarriageCard;
