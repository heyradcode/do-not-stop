import React, { useMemo, useState } from 'react';
import TransactionStatus from '@components/common/transaction-status';
import NeonButton from '@components/ui/neon-button';
import {
    getPetAvatar,
    getPetClass,
    getReadyPetsUnified,
    getXpNumbers,
    getXpPercent,
    useChainCapabilities,
    useFees,
    useTrainPet,
    usePetList,
} from '@shared/core';
import { useNotifyError } from '@hooks/useNotifyError';
import { useTxErrorToast } from '@hooks/useTxErrorToast';
import Icon, { CheckIcon } from '@components/ui/icon';
import { Tones } from '@constants/tones';
import './index.css';

export type TrainPanelProps = {
    isStandaloneView?: boolean;
};

const TrainPanel: React.FC<TrainPanelProps> = ({ isStandaloneView = true }) => {
    const { isConnected } = useChainCapabilities();
    const { pets, refetch } = usePetList();
    const notifyError = useNotifyError();

    const [selectedPet, setSelectedPet] = useState<string>('');
    const [success, setSuccess] = useState<string | null>(null);

    const handleTrainComplete = () => {
        setSuccess('Pet trained successfully!');
        setSelectedPet('');
        refetch();
    };

    const {
        mutate,
        isPending,
        error: hookError,
        reset,
        lifecycle,
    } = useTrainPet({
        onSuccess: handleTrainComplete,
    });
    const readyPets = useMemo(() => getReadyPetsUnified(pets), [pets]);
    const fees = useFees();
    const selectedPetObj = readyPets.find(({ id }) => id === selectedPet)?.pet ?? null;
    const selectedLevel = selectedPetObj?.level;

    // Train fee is level-scaled: baseFee × (100 + 2·level) / 100.
    const trainCost = useMemo(() => {
        if (selectedLevel == null || fees.trainFee == null) return null;
        const multiplier = BigInt(100 + 2 * selectedLevel);
        return fees.formatAmount((fees.trainFee * multiplier) / 100n);
    }, [fees, selectedLevel]);

    useTxErrorToast(hookError);

    const handleTrain = async () => {
        if (!isConnected) {
            notifyError('Please connect your wallet first', undefined, 'train-validation');
            return;
        }
        if (!selectedPet) {
            notifyError('Please select a pet to train', undefined, 'train-validation');
            return;
        }

        reset();
        setSuccess(null);

        try {
            await mutate({ petId: selectedPet });
        } catch (err) {
            console.error('[train]', err);
        }
    };

    const buttonLabel = isPending ? 'Training...' : trainCost ? `Train (${trainCost})` : 'Train';

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4>💪 Train Pet</h4>
                        <p>Pay a level-scaled fee for an instant XP boost.</p>
                    </>
                )}

                {selectedPetObj && (
                    <div className="train-status">
                        <div className="train-status__visual">
                            <span className="train-status__level">Lv.{selectedPetObj.level}</span>
                            <span className="train-status__avatar">
                                {getPetAvatar(selectedPetObj.dna)}
                            </span>
                        </div>
                        <div className="train-status__body">
                            <div className="train-status__name">{selectedPetObj.name}</div>
                            <div className="train-status__class">
                                {getPetClass(selectedPetObj.dna)}
                            </div>
                            <div className="train-status__xp-track">
                                <div
                                    className="train-status__xp-fill"
                                    style={{ width: `${getXpPercent(selectedPetObj)}%` }}
                                />
                            </div>
                            <div className="train-status__xp">
                                {getXpNumbers(selectedPetObj).xpCurrent}/
                                {getXpNumbers(selectedPetObj).xpMax} XP
                            </div>
                        </div>
                    </div>
                )}

                <div className="picker">
                    <div className="field">
                        <label htmlFor="train-pet">Select Pet</label>
                        <select
                            id="train-pet"
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
                    {trainCost && <p className="train-cost">Cost: {trainCost}</p>}
                </div>

                <div className="action-controls">
                    <NeonButton
                        tone="emerald"
                        onClick={handleTrain}
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
                </div>
            )}

            <TransactionStatus lifecycle={lifecycle} />
        </>
    );
};

export default TrainPanel;
