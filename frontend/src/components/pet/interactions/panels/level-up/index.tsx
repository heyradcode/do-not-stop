import React, { useMemo, useState } from 'react';
import TransactionStatus from '@components/common/transaction-status';
import {
    getReadyPetsUnified,
    useChainCapabilities,
    useFees,
    useLevelUpPet,
    usePetList,
} from '@shared/core';
import { useNotifyError } from '@hooks/useNotifyError';
import { useTxErrorToast } from '@hooks/useTxErrorToast';
import Icon, { CheckIcon } from '@components/ui/icon';
import { Tones } from '@constants/tones';

export type LevelUpPanelProps = {
    isStandaloneView?: boolean;
};

const LevelUpPanel: React.FC<LevelUpPanelProps> = ({ isStandaloneView = true }) => {
    const { levelUpFee } = useChainCapabilities();
    const { pets, refetch } = usePetList();
    const notifyError = useNotifyError();

    const [selectedPet, setSelectedPet] = useState<string>('');
    const [success, setSuccess] = useState<string | null>(null);

    // Settlement is lifecycle-driven (EVM: receipt confirmed; Solana: resolve).
    const handleLevelUpComplete = () => {
        setSuccess('Pet leveled up successfully!');
        setSelectedPet('');
        refetch();
    };

    const { mutate, isPending, error: hookError, reset, lifecycle } = useLevelUpPet({
        onSuccess: handleLevelUpComplete,
    });
    const readyPets = useMemo(() => getReadyPetsUnified(pets), [pets]);
    const fees = useFees();
    const selectedLevel = readyPets.find(({ id }) => id === selectedPet)?.pet.level;

    // Level-up fee is level-scaled: baseFee × (100 + (level-1)²) / 100.
    const levelUpCost = useMemo(() => {
        if (selectedLevel == null || fees.levelUpFee == null) return null;
        const diff = BigInt(Math.max(selectedLevel - 1, 0));
        const multiplier = 100n + diff * diff;
        return fees.formatAmount((fees.levelUpFee * multiplier) / 100n);
    }, [fees, selectedLevel]);

    useTxErrorToast(hookError);

    const handleLevelUp = async () => {
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
                        <h4>â¬†ï¸ Level Up Pet</h4>
                        <p>
                            {levelUpFee
                                ? `Pay from ${levelUpFee.amount} ${levelUpFee.symbol} to level up your pet — cost rises with level`
                                : 'Pay a small SOL fee to level up your pet'}
                        </p>
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
                    {levelUpCost && <p className="level-up-cost">Cost: {levelUpCost}</p>}
                </div>

                <div className="action-controls">
                    <button type="button" onClick={handleLevelUp} disabled={isPending || !selectedPet}>
                        {buttonLabel}
                    </button>
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

export default LevelUpPanel;
