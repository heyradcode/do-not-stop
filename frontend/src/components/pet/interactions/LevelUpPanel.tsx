import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TransactionStatus from '../../ui/TransactionStatus';
import { usePetsContract, getReadyPets } from '@shared/core';
import { petsContractParams } from '../../../petsContractParams';
import { DASHBOARD_HOME } from '../../../constants/interactionRoutes';
import { useWriteContractErrorState } from '../../../hooks/useWriteContractErrorState';

export type LevelUpPanelProps = {
    isStandaloneView?: boolean;
};

const LevelUpPanel: React.FC<LevelUpPanelProps> = ({ isStandaloneView = true }) => {
    const navigate = useNavigate();
    const { levelUp, petIds, pets, isReady, hash, isPending, writeError, refetchPetIds } =
        usePetsContract(petsContractParams);
    const readyPets = useMemo(() => getReadyPets(petIds, pets, isReady), [petIds, pets, isReady]);
    const { error, setError, isUserRejection, isContractError, resetError } = useWriteContractErrorState(writeError);

    const [selectedPet, setSelectedPet] = useState<bigint | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const handleLevelUp = async () => {
        if (!selectedPet) {
            setError('Please select a pet to level up');
            return;
        }

        resetError();
        setSuccess(null);

        try {
            await levelUp(selectedPet);
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
        setSelectedPet(null);
        resetError();
        navigate(DASHBOARD_HOME);
        refetchPetIds();
    };

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4>⬆️ Level Up Pet</h4>
                        <p>Pay 0.001 ETH to level up your pet</p>
                    </>
                )}

                <div className="picker">
                    <div className="field">
                        <label>Select Pet</label>
                        <select
                            value={selectedPet?.toString() || ''}
                            onChange={(e) => setSelectedPet(e.target.value ? BigInt(e.target.value) : null)}
                        >
                            <option value="">Select pet...</option>
                            {readyPets.map(({ id, pet }) => (
                                <option key={id.toString()} value={id.toString()}>
                                    {pet.name} (Level {pet.level})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="action-controls">
                    <button type="button" onClick={handleLevelUp} disabled={isPending || !selectedPet}>
                        {isPending ? 'Leveling Up...' : 'Level Up (0.001 ETH)'}
                    </button>
                    <button type="button" onClick={handleCancel} className="cancel-button">
                        Cancel
                    </button>
                </div>
            </div>

            {error && (
                <div className={`error-message ${isUserRejection ? 'user-rejection' : ''} ${isContractError ? 'contract-error' : ''}`}>
                    {isUserRejection ? '⏸️' : isContractError ? '⚠️' : '❌'} {error}
                </div>
            )}

            {success && (
                <div className="success-message">
                    ✅ {success}
                </div>
            )}

            <TransactionStatus hash={hash} onComplete={handleTransactionComplete} onError={(e) => setError(e.message)} />
        </>
    );
};

export default LevelUpPanel;
