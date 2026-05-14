import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TransactionStatus from '../../ui/TransactionStatus';
import { usePetsContract, getReadyPets } from '@shared/core';
import { petsContractParams } from '../../../petsContractParams';
import { DASHBOARD_HOME } from '../../../constants/interactionRoutes';
import { useWriteContractErrorState } from '../../../hooks/useWriteContractErrorState';

export type RenamePanelProps = {
    isStandaloneView?: boolean;
};

const RenamePanel: React.FC<RenamePanelProps> = ({ isStandaloneView = true }) => {
    const navigate = useNavigate();
    const { changeName, petIds, pets, isReady, hash, isPending, writeError, refetchPetIds } =
        usePetsContract(petsContractParams);
    const readyPets = useMemo(() => getReadyPets(petIds, pets, isReady), [petIds, pets, isReady]);
    const { error, setError, isUserRejection, isContractError, resetError } = useWriteContractErrorState(writeError);

    const [selectedPet, setSelectedPet] = useState<bigint | null>(null);
    const [newName, setNewName] = useState('');
    const [success, setSuccess] = useState<string | null>(null);

    const handleChangeName = async () => {
        if (!selectedPet || !newName.trim()) {
            setError('Please select a pet and enter a new name');
            return;
        }

        resetError();
        setSuccess(null);

        try {
            await changeName(selectedPet, newName.trim());
        } catch (err) {
            setError('Failed to change pet name. Please try again.');
            console.error('Error changing pet name:', err);
        }
    };

    const handleCancel = () => {
        setSuccess(null);
        navigate(DASHBOARD_HOME);
    };

    const handleTransactionComplete = () => {
        setSuccess(`Pet name changed to "${newName}"!`);
        setSelectedPet(null);
        setNewName('');
        resetError();
        navigate(DASHBOARD_HOME);
        refetchPetIds();
    };

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4>✏️ Change Pet Name</h4>
                        <p>Change your pet&apos;s name (requires level 2+)</p>
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
                            {readyPets
                                .filter(({ pet }) => pet.level >= 2)
                                .map(({ id, pet }) => (
                                    <option key={id.toString()} value={id.toString()}>
                                        {pet.name} (Level {pet.level})
                                    </option>
                                ))}
                        </select>
                    </div>

                    <div className="field">
                        <label>New Name</label>
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Enter new name..."
                            maxLength={20}
                        />
                    </div>
                </div>

                <div className="action-controls">
                    <button type="button" onClick={handleChangeName} disabled={isPending || !selectedPet || !newName.trim()}>
                        {isPending ? 'Changing Name...' : 'Change Name'}
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

export default RenamePanel;
