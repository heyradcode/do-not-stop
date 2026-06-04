import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TransactionStatus from '@components/common/transaction-status';
import {
    getReadyPetsUnified,
    useActiveChain,
    useLevelUpPet,
    usePetList,
} from '@shared/core';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { useNotifyError, useNotifyReceiptError } from '@hooks/useNotifyError';
import { useTxErrorToast } from '@hooks/useTxErrorToast';
import Icon, { CheckIcon } from '@components/ui/icon';
import { Tones } from '@constants/tones';

export type LevelUpPanelProps = {
    isStandaloneView?: boolean;
};

const LevelUpPanel: React.FC<LevelUpPanelProps> = ({ isStandaloneView = true }) => {
    const navigate = useNavigate();
    const chain = useActiveChain();
    const { pets, refetch } = usePetList();
    const { mutate, isPending, error: hookError, hash, reset } = useLevelUpPet();
    const readyPets = useMemo(() => getReadyPetsUnified(pets), [pets]);
    const notifyError = useNotifyError();
    const notifyReceiptError = useNotifyReceiptError();

    useTxErrorToast(hookError);

    const [selectedPet, setSelectedPet] = useState<string>('');
    const [success, setSuccess] = useState<string | null>(null);

    const handleLevelUp = async () => {
        if (!selectedPet) {
            notifyError('Please select a pet to level up', undefined, 'level-up-validation');
            return;
        }

        reset();
        setSuccess(null);

        try {
            await mutate({ petId: selectedPet });
            if (chain.kind === 'solana') {
                setSuccess('Pet leveled up successfully!');
                setSelectedPet('');
                refetch();
                navigate(DASHBOARD_HOME);
            }
        } catch (err) {
            console.error('[level-up]', err);
        }
    };

    const handleCancel = () => {
        setSuccess(null);
        navigate(DASHBOARD_HOME);
    };

    const handleTransactionComplete = () => {
        setSuccess('Pet leveled up successfully!');
        setSelectedPet('');
        refetch();
        navigate(DASHBOARD_HOME);
    };

    const buttonLabel = isPending
        ? 'Leveling Up...'
        : chain.kind === 'solana'
            ? 'Level Up'
            : 'Level Up (0.001 ETH)';

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4>â¬†ï¸ Level Up Pet</h4>
                        <p>
                            {chain.kind === 'solana'
                                ? 'Pay a small SOL fee to level up your pet'
                                : 'Pay 0.001 ETH to level up your pet'}
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
                </div>

                <div className="action-controls">
                    <button type="button" onClick={handleLevelUp} disabled={isPending || !selectedPet}>
                        {buttonLabel}
                    </button>
                    <button type="button" onClick={handleCancel} className="cancel-button">
                        Cancel
                    </button>
                </div>
            </div>

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                </div>
            )}

            {chain.kind === 'evm' && (
                <TransactionStatus
                    hash={hash}
                    onComplete={handleTransactionComplete}
                    onError={notifyReceiptError}
                />
            )}
        </>
    );
};

export default LevelUpPanel;
