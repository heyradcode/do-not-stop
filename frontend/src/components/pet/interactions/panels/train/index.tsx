import React, { useMemo, useState } from 'react';
import TransactionStatus from '@components/common/transaction-status';
import { AuthActionButton } from '@components/common';
import { getReadyPetsUnified, useFees, useTrainPet, usePetList } from '@shared/core';
import { useNotifyError } from '@hooks/useNotifyError';
import { useTxErrorToast } from '@hooks/useTxErrorToast';
import Icon, { CheckIcon } from '@components/ui/icon';
import { Tones } from '@constants/tones';

export type TrainPanelProps = {
    isStandaloneView?: boolean;
};

const TrainPanel: React.FC<TrainPanelProps> = ({ isStandaloneView = true }) => {
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
    const selectedLevel = readyPets.find(({ id }) => id === selectedPet)?.pet.level;

    // Train fee is level-scaled: baseFee × (100 + 2·level) / 100.
    const trainCost = useMemo(() => {
        if (selectedLevel == null || fees.trainFee == null) return null;
        const multiplier = BigInt(100 + 2 * selectedLevel);
        return fees.formatAmount((fees.trainFee * multiplier) / 100n);
    }, [fees, selectedLevel]);

    useTxErrorToast(hookError);

    const handleTrain = async () => {
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

                <div className="picker">
                    <div className="field">
                        <label>Select Pet</label>
                        <select
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
                    <AuthActionButton
                        tone="emerald"
                        onClick={handleTrain}
                        disabled={isPending || !selectedPet}
                    >
                        {buttonLabel}
                    </AuthActionButton>
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
