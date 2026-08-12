import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import TransactionStatus from '@components/common/transaction-status';
import NeonButton from '@components/ui/neon-button';
import PetPicker from '@components/ui/pet-picker';
import {
    getPetClass,
    getReadyPetsUnified,
    getXpNumbers,
    getXpPercent,
    useChainCapabilities,
    useFees,
    useLevelUpPet,
    usePetList,
} from '@shared/core';
import { useNotifyError } from '@hooks/useNotifyError';
import { useTxErrorToast } from '@hooks/useTxErrorToast';
import Icon, { CheckIcon } from '@components/ui/icon';
import { Tones } from '@constants/tones';
import SyncMetadataButton from './sync-metadata-button';
import PetShowcase from '../_shared/pet-showcase';
import styles from './index.module.css';
import PetArt from '@components/pet/pet-art';

export type LevelUpPanelProps = {
    isStandaloneView?: boolean;
};

const LevelUpPanel: React.FC<LevelUpPanelProps> = ({ isStandaloneView = true }) => {
    const { levelUpFee, levelUpFeeFor, isConnected } = useChainCapabilities();
    const { pets, refetch } = usePetList();
    const notifyError = useNotifyError();

    const [selectedPet, setSelectedPet] = useState<string>('');
    const [success, setSuccess] = useState<string | null>(null);
    const [leveledUpPetId, setLeveledUpPetId] = useState<string | null>(null);

    // Settlement is lifecycle-driven (EVM: receipt confirmed; Solana: resolve).
    const handleLevelUpComplete = () => {
        setLeveledUpPetId(selectedPet);
        setSuccess('Pet leveled up successfully!');
        setSelectedPet('');
        refetch();
    };

    const {
        mutate,
        isPending,
        error: hookError,
        reset,
        lifecycle,
    } = useLevelUpPet({
        onSuccess: handleLevelUpComplete,
    });
    const readyPets = useMemo(() => getReadyPetsUnified(pets), [pets]);
    const fees = useFees();
    const selectedPetObj = readyPets.find(({ id }) => id === selectedPet)?.pet ?? null;
    const selectedLevel = selectedPetObj?.level;
    const selectedXp = selectedPetObj ? getXpNumbers(selectedPetObj) : null;

    // The curve is the chain's, not this panel's: EVM scales quadratically with level and
    // Solana charges a flat fee. Hardcoding the EVM formula here quoted a Solana player a
    // number their wallet was never going to be debited.
    const levelUpCost = useMemo(() => {
        if (selectedLevel == null || fees.levelUpFee == null) return null;
        return fees.formatAmount(levelUpFeeFor(fees.levelUpFee, selectedLevel));
    }, [fees, levelUpFeeFor, selectedLevel]);

    useTxErrorToast(hookError);

    const handleLevelUp = async () => {
        if (!isConnected) {
            notifyError('Please connect your wallet first', undefined, 'level-up-validation');
            return;
        }
        if (!selectedPet) {
            notifyError('Please select a pet to level up', undefined, 'level-up-validation');
            return;
        }

        reset();
        setSuccess(null);

        try {
            await mutate({ petId: selectedPet });
        } catch (err) {
            console.error('[level-up]', err);
        }
    };

    // "from" only means something where the price climbs. On a flat-fee chain the base fee
    // is the whole price, and hedging it reads as a quote the player cannot pin down.
    //
    // Probed at level 11 rather than 2 because EVM's curve is integer division: at level 2
    // the multiplier is 101/100, which floors back to the base fee for any base under 100
    // wei and would report a rising fee as flat.
    const feeRisesWithLevel =
        fees.levelUpFee != null && levelUpFeeFor(fees.levelUpFee, 11) > fees.levelUpFee;

    const buttonLabel = isPending
        ? 'Leveling Up...'
        : levelUpCost
        ? `Level Up (${levelUpCost})`
        : levelUpFee
        ? `Level Up (${feeRisesWithLevel ? 'from ' : ''}${levelUpFee.amount} ${levelUpFee.symbol})`
        : 'Level Up';

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4>⬆️ Level Up Pet</h4>
                        <p>
                            {levelUpFee
                                ? feeRisesWithLevel
                                    ? `Pay from ${levelUpFee.amount} ${levelUpFee.symbol} to level up your pet — cost rises with level`
                                    : `Pay ${levelUpFee.amount} ${levelUpFee.symbol} to level up your pet`
                                : 'Pay a small SOL fee to level up your pet'}
                        </p>
                    </>
                )}

                {/* The slot is always rendered, with a placeholder standing in before a
                    pet is chosen, so picking one swaps content into a box that is
                    already the right size and nothing on the panel shifts. */}
                <div className="interaction-visual">
                {!selectedPetObj && (
                    // Built from the same classes as the filled state rather than from
                    // its own skeleton layout, so the two are the same height by
                    // construction instead of by hand-matched numbers that drift.
                    <PetShowcase avatar={<span className="pet-slot-glyph">?</span>} accent="violet">
                        <div className={styles.name}>
                            <span className="skeleton-bar wide" />
                        </div>
                        <div className={styles.petClass}>
                            <span className="skeleton-bar narrow" />
                        </div>
                        <div className={styles.transition}>
                            <span className={clsx(styles.badge, styles.badgeCur)}>Lv.?</span>
                            <span className={styles.arrow} aria-hidden>
                                →
                            </span>
                            <span className={clsx(styles.badge, styles.badgeNext)}>Lv.?</span>
                        </div>
                        <div className={styles.xp}>
                            <div className={styles.xpRow}>
                                <span>XP</span>
                                <span>—</span>
                            </div>
                            <div className={styles.xpTrack} />
                        </div>
                    </PetShowcase>
                )}
                {selectedPetObj && (
                    <PetShowcase avatar={<PetArt pet={selectedPetObj} />} accent="violet">
                        <div className={styles.name}>{selectedPetObj.name}</div>
                        <div className={styles.petClass}>{getPetClass(selectedPetObj.dna)}</div>
                        <div className={styles.transition}>
                            <span className={clsx(styles.badge, styles.badgeCur)}>
                                Lv.{selectedPetObj.level}
                            </span>
                            <span className={styles.arrow} aria-hidden>
                                →
                            </span>
                            <span className={clsx(styles.badge, styles.badgeNext)}>
                                Lv.{selectedPetObj.level + 1}
                            </span>
                        </div>
                        <div className={styles.xp}>
                            <div className={styles.xpRow}>
                                <span>XP</span>
                                <span>
                                    {selectedXp?.xpCurrent}/{selectedXp?.xpMax}
                                </span>
                            </div>
                            <div className={styles.xpTrack}>
                                <div
                                    className={styles.xpFill}
                                    style={{ width: `${getXpPercent(selectedPetObj)}%` }}
                                />
                            </div>
                        </div>
                    </PetShowcase>
                )}
                </div>

                <div className="picker">
                    <div className="field">
                        <span className="field-label">Select Pet</span>
                        <PetPicker
                            pets={readyPets}
                            value={selectedPet}
                            onChange={setSelectedPet}
                            label="Pet to level up"
                            emptyHint="No pets are ready right now."
                        />
                    </div>
                    {levelUpCost && <p className="level-up-cost">Cost: {levelUpCost}</p>}
                </div>

                <div className="action-controls">
                    <NeonButton
                        tone="emerald"
                        onClick={handleLevelUp}
                        disabled={isPending || !selectedPet || !isConnected}
                    >
                        {buttonLabel}
                    </NeonButton>
                </div>
            </div>

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                    <SyncMetadataButton petId={leveledUpPetId ?? undefined} />
                </div>
            )}

            <TransactionStatus lifecycle={lifecycle} />
        </>
    );
};

export default LevelUpPanel;
