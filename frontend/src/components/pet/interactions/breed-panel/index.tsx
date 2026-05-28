import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TransactionStatus from '@components/common/transaction-status';
import { getReadyPetsUnified, useBreedPets, usePetList } from '@shared/core';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { Tones } from '@constants/tones';
import Icon, { CheckIcon, CloseIcon, DnaIcon, PauseIcon, WarningIcon } from '@components/common/icon';

export type BreedPanelProps = {
    /** `false` when embedded under the dashboard interactions hub. */
    isStandaloneView?: boolean;
};

const BreedPanel: React.FC<BreedPanelProps> = ({ isStandaloneView = true }) => {
    const navigate = useNavigate();
    const { pets, refetch } = usePetList();
    const [selectedPet1, setSelectedPet1] = useState('');
    const [selectedPet2, setSelectedPet2] = useState('');
    const [newPetName, setNewPetName] = useState('');
    const [success, setSuccess] = useState<string | null>(null);

    const handleSuccess = useCallback(
        ({ name }: { name: string }) => {
            setSuccess(`Pet "${name}" created successfully!`);
            setSelectedPet1('');
            setSelectedPet2('');
            setNewPetName('');
            void refetch();
            navigate(DASHBOARD_HOME);
        },
        [navigate, refetch]
    );

    const breed = useBreedPets({ onSuccess: handleSuccess });
    const readyPets = useMemo(() => getReadyPetsUnified(pets), [pets]);

    const handleBreed = () => {
        breed.clearErrors();
        setSuccess(null);
        void breed.mutate({
            parentId1: selectedPet1,
            parentId2: selectedPet2,
            name: newPetName.trim(),
        });
    };

    const handleCancel = () => {
        setSuccess(null);
        breed.reset();
        navigate(DASHBOARD_HOME);
    };

    const { error } = breed;
    const ErrorIcon = error.isUserRejection ? PauseIcon : error.isContractError ? WarningIcon : CloseIcon;
    const errorTone = error.isUserRejection ? Tones.Inherit : error.isContractError ? Tones.Amber : Tones.Magenta;

    const canSubmit = Boolean(selectedPet1 && selectedPet2 && newPetName.trim());

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4><Icon as={DnaIcon} tone={Tones.Emerald} />Breed Pets</h4>
                        <p>{breed.subtitle}</p>
                    </>
                )}

                <div className="picker">
                    <div className="field">
                        <label>First Parent</label>
                        <select
                            value={selectedPet1}
                            onChange={(e) => setSelectedPet1(e.target.value)}
                        >
                            <option value="">Select pet...</option>
                            {readyPets.map(({ id, pet }) => (
                                <option key={id} value={id}>
                                    {pet.name} (Level {pet.level})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="field">
                        <label>Second Parent</label>
                        <select
                            value={selectedPet2}
                            onChange={(e) => setSelectedPet2(e.target.value)}
                        >
                            <option value="">Select pet...</option>
                            {readyPets
                                .filter(({ id }) => id !== selectedPet1)
                                .map(({ id, pet }) => (
                                    <option key={id} value={id}>
                                        {pet.name} (Level {pet.level})
                                    </option>
                                ))}
                        </select>
                    </div>
                </div>

                <div className="name-input">
                    <label>Offspring Name</label>
                    <input
                        type="text"
                        value={newPetName}
                        onChange={(e) => setNewPetName(e.target.value)}
                        placeholder="Enter name for the new pet..."
                        maxLength={20}
                    />
                </div>

                <div className="action-controls">
                    <button
                        type="button"
                        onClick={handleBreed}
                        disabled={breed.isPending || breed.isAwaitingFulfillment || !canSubmit}
                    >
                        {breed.buttonLabel}
                    </button>
                    <button type="button" onClick={handleCancel} className="cancel-button">
                        Cancel
                    </button>
                </div>

                {breed.awaitingHint && (
                    <p className="breed-pending-hint" style={{ marginTop: '0.75rem', fontSize: '0.9rem', opacity: 0.85 }}>
                        {breed.awaitingHint}
                    </p>
                )}
            </div>

            {error.message && (
                <div
                    className={`error-message ${error.isUserRejection ? 'user-rejection' : ''} ${error.isContractError ? 'contract-error' : ''}`}
                >
                    <Icon as={ErrorIcon} tone={errorTone} />
                    {error.message}
                </div>
            )}

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                </div>
            )}

            {breed.hashHint && (
                <p className="breed-pending-hint" style={{ marginTop: '0.75rem', fontSize: '0.9rem', opacity: 0.85 }}>
                    Transaction: {breed.hashHint}
                </p>
            )}

            {breed.transactionTracker && (
                <TransactionStatus
                    hash={breed.transactionTracker.hash}
                    onComplete={breed.transactionTracker.onComplete}
                    onError={breed.transactionTracker.onError}
                />
            )}
        </>
    );
};

export default BreedPanel;
