import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TransactionStatus from '@components/common/transaction-status';
import {
    getReadyPetsUnified,
    useActiveChain,
    useLevelUpPet,
    usePetList,
} from '@shared/core';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { useWriteContractErrorState } from '@hooks/useWriteContractErrorState';
import Icon, { CheckIcon, CloseIcon, PauseIcon, WarningIcon } from '@components/common/icon';

export type LevelUpPanelProps = {
    isStandaloneView?: boolean;
};

const LevelUpPanel: React.FC<LevelUpPanelProps> = ({ isStandaloneView = true }) => {
    const navigate = useNavigate();
    const chain = useActiveChain();
    const { pets, refetch } = usePetList();
    const { mutate, isPending, error: hookError, hash, reset } = useLevelUpPet();
    const readyPets = useMemo(() => getReadyPetsUnified(pets), [pets]);
    const { error, setError, isUserRejection, isContractError, resetError } = useWriteContractErrorState(hookError);

    const [selectedPet, setSelectedPet] = useState<string>('');
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        if (hookError) {
            setError(hookError.message);
        }
    }, [hookError, setError]);

    const handleLevelUp = async () => {
        if (!selectedPet) {
            setError('Please select a pet to level up');
            return;
        }

        resetError();
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
            setError('Failed to level up pet. Please try again.');
            console.error('Error leveling up pet:', err);
        }
    };

    const handleCancel = () => {
        setSuccess(null);
        navigate(DASHBOARD_HOME);
    };

    const handleTransactionComplete = () => {
        setSuccess('Pet leveled up successfully!');
        setSelectedPet('');
        resetError();
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
                        <h4>⬆️ Level Up Pet</h4>
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

            {error && (
                <div className={`error-message ${isUserRejection ? 'user-rejection' : ''} ${isContractError ? 'contract-error' : ''}`}>
                    <Icon
                        as={isUserRejection ? PauseIcon : isContractError ? WarningIcon : CloseIcon}
                        tone={isUserRejection ? 'inherit' : isContractError ? 'amber' : 'magenta'}
                    />
                    {error}
                </div>
            )}

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone="emerald" />
                    {success}
                </div>
            )}

            {chain.kind === 'evm' && (
                <TransactionStatus hash={hash} onComplete={handleTransactionComplete} onError={(e) => setError(e.message)} />
            )}
        </>
    );
};

export default LevelUpPanel;
