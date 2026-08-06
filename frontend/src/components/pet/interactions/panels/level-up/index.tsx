import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import TransactionStatus from '@components/common/transaction-status';
import NeonButton from '@components/ui/neon-button';
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
    const { levelUpFee, isConnected } = useChainCapabilities();
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

    // Level-up fee is level-scaled: baseFee × (100 + (level-1)²) / 100.
    const levelUpCost = useMemo(() => {
        if (selectedLevel == null || fees.levelUpFee == null) return null;
        const diff = BigInt(Math.max(selectedLevel - 1, 0));
        const multiplier = 100n + diff * diff;
        return fees.formatAmount((fees.levelUpFee * multiplier) / 100n);
    }, [fees, selectedLevel]);

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

    const buttonLabel = isPending
        ? 'Leveling Up...'
        : levelUpCost
        ? `Level Up (${levelUpCost})`
        : levelUpFee
        ? `Level Up (from ${levelUpFee.amount} ${levelUpFee.symbol})`
        : 'Level Up';

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4>⬆️ Level Up Pet</h4>
                        <p>
                            {levelUpFee
                                ? `Pay from ${levelUpFee.amount} ${levelUpFee.symbol} to level up your pet — cost rises with level`
                                : 'Pay a small SOL fee to level up your pet'}
                        </p>
                    </>
                )}

                {selectedPetObj && (
                    // `interaction-visual` is the layout hook: it marks the pet column
                    // for the two-column rule in interactions.css.
                    <div className="interaction-visual">
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
                    </div>
                )}

                <div className="picker">
                    <div className="field">
                        <label htmlFor="levelup-pet">Select Pet</label>
                        <select
                            id="levelup-pet"
                            value={selectedPet}
                            onChange={(e) => setSelectedPet(e.target.value)}
                        >
                            <option value="">Select pet...</option>
                            {readyPets.map(({ id, pet }) => (
                                <option key={id} value={id}>
                                    {pet.name} (Level {pet.level})
                                </option>
                            ))}
                        </select>
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
