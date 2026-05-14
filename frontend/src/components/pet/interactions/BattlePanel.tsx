import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TransactionStatus from '../../ui/TransactionStatus';
import { usePetsContract, getReadyPets } from '@shared/core';
import { petsContractParams } from '../../../petsContractParams';
import { DASHBOARD_HOME } from '../../../constants/interactionRoutes';
import { useWriteContractErrorState } from '../../../hooks/useWriteContractErrorState';

export type BattlePanelProps = {
    isStandaloneView?: boolean;
};

const BattlePanel: React.FC<BattlePanelProps> = ({ isStandaloneView = true }) => {
    const navigate = useNavigate();
    const { battlePets, petIds, pets, isReady, hash, isPending, writeError, refetchPetIds } =
        usePetsContract(petsContractParams);
    const readyPets = useMemo(() => getReadyPets(petIds, pets, isReady), [petIds, pets, isReady]);
    const { error, setError, isUserRejection, isContractError, resetError } = useWriteContractErrorState(writeError);

    const [selectedPet1, setSelectedPet1] = useState<bigint | null>(null);
    const [selectedPet2, setSelectedPet2] = useState<bigint | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const handleBattle = async () => {
        if (!selectedPet1 || !selectedPet2) {
            setError('Please select two pets to battle');
            return;
        }

        resetError();
        setSuccess(null);

        try {
            await battlePets(selectedPet1, selectedPet2);
        } catch (err) {
            setError('Failed to start battle. Please try again.');
            console.error('Error starting battle:', err);
        }
    };

    const handleCancel = () => {
        setSuccess(null);
        navigate(DASHBOARD_HOME);
    };

    const handleTransactionComplete = () => {
        setSuccess('Battle completed! Check your pets for level ups.');
        setSelectedPet1(null);
        setSelectedPet2(null);
        resetError();
        navigate(DASHBOARD_HOME);
        refetchPetIds();
    };

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4>⚔️ Battle Pets</h4>
                        <p>Select two pets to battle</p>
                    </>
                )}

                <div className="picker">
                    <div className="field">
                        <label>First Fighter</label>
                        <select
                            value={selectedPet1?.toString() || ''}
                            onChange={(e) => setSelectedPet1(e.target.value ? BigInt(e.target.value) : null)}
                        >
                            <option value="">Select pet...</option>
                            {readyPets.map(({ id, pet }) => (
                                <option key={id.toString()} value={id.toString()}>
                                    {pet.name} (Level {pet.level})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="field">
                        <label>Second Fighter</label>
                        <select
                            value={selectedPet2?.toString() || ''}
                            onChange={(e) => setSelectedPet2(e.target.value ? BigInt(e.target.value) : null)}
                        >
                            <option value="">Select pet...</option>
                            {readyPets
                                .filter(({ id }) => id !== selectedPet1)
                                .map(({ id, pet }) => (
                                    <option key={id.toString()} value={id.toString()}>
                                        {pet.name} (Level {pet.level})
                                    </option>
                                ))}
                        </select>
                    </div>
                </div>

                <div className="action-controls">
                    <button type="button" onClick={handleBattle} disabled={isPending || !selectedPet1 || !selectedPet2}>
                        {isPending ? 'Starting Battle...' : 'Start Battle'}
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

export default BattlePanel;
