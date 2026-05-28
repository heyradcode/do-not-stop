import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TransactionStatus from '@components/common/transaction-status';
import { getReadyPetsUnified, useActiveChain, useBreedPets, usePetList } from '@shared/core';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { Tones } from '@constants/tones';
import { formatTxHashHint, usePetActionErrorDisplay } from '@hooks/usePetActionErrorDisplay';
import Icon, { CheckIcon, CloseIcon, DnaIcon, PauseIcon, WarningIcon } from '@components/common/icon';

export type BreedPanelProps = {
    /** `false` when embedded under the dashboard interactions hub. */
    isStandaloneView?: boolean;
};

const VALIDATION_MESSAGE = 'Please select two pets and enter a name for the offspring';
const BREED_FAIL_MESSAGE = 'Failed to breed pets. Please try again.';
const AWAITING_HINT = 'Hang tight—your new pet will show up in a moment.';

const BreedPanel: React.FC<BreedPanelProps> = ({ isStandaloneView = true }) => {
    const navigate = useNavigate();
    const chain = useActiveChain();
    const { pets, refetch } = usePetList();
    const [selectedPet1, setSelectedPet1] = useState('');
    const [selectedPet2, setSelectedPet2] = useState('');
    const [newPetName, setNewPetName] = useState('');
    const [success, setSuccess] = useState<string | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);

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

    const displayError = usePetActionErrorDisplay(
        breed.error,
        breed.receiptError,
        validationError,
        BREED_FAIL_MESSAGE,
    );

    const usesSwitchboardVrf = chain.kind === 'solana';
    const subtitle = usesSwitchboardVrf
        ? 'Select two pets to create a new one (Switchboard VRF)'
        : 'Select two pets to create a new one';
    const pendingLabel = usesSwitchboardVrf ? 'Generating randomness…' : 'Submitting…';
    const creatingLabel = 'Creating…';
    const submitLabel = 'Breed Pets';
    const buttonLabel = breed.isPending
        ? pendingLabel
        : breed.isAwaitingFulfillment
          ? creatingLabel
          : submitLabel;
    const hashHint = chain.kind === 'solana' ? formatTxHashHint(breed.hash) : null;

    const canSubmit = Boolean(selectedPet1 && selectedPet2 && newPetName.trim());

    const handleBreed = () => {
        breed.clearErrors();
        setSuccess(null);
        setValidationError(null);

        if (!canSubmit) {
            setValidationError(VALIDATION_MESSAGE);
            return;
        }

        void breed.mutate({
            parentId1: selectedPet1,
            parentId2: selectedPet2,
            name: newPetName.trim(),
        });
    };

    const handleCancel = () => {
        setSuccess(null);
        setValidationError(null);
        breed.reset();
        navigate(DASHBOARD_HOME);
    };

    const ErrorIcon = displayError.isUserRejection
        ? PauseIcon
        : displayError.isContractError
          ? WarningIcon
          : CloseIcon;
    const errorTone = displayError.isUserRejection
        ? Tones.Inherit
        : displayError.isContractError
          ? Tones.Amber
          : Tones.Magenta;

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4><Icon as={DnaIcon} tone={Tones.Emerald} />Breed Pets</h4>
                        <p>{subtitle}</p>
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
                        {buttonLabel}
                    </button>
                    <button type="button" onClick={handleCancel} className="cancel-button">
                        Cancel
                    </button>
                </div>

                {breed.isAwaitingFulfillment && (
                    <p className="breed-pending-hint" style={{ marginTop: '0.75rem', fontSize: '0.9rem', opacity: 0.85 }}>
                        {AWAITING_HINT}
                    </p>
                )}
            </div>

            {displayError.message && (
                <div
                    className={`error-message ${displayError.isUserRejection ? 'user-rejection' : ''} ${displayError.isContractError ? 'contract-error' : ''}`}
                >
                    <Icon as={ErrorIcon} tone={errorTone} />
                    {displayError.message}
                </div>
            )}

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                </div>
            )}

            {hashHint && (
                <p className="breed-pending-hint" style={{ marginTop: '0.75rem', fontSize: '0.9rem', opacity: 0.85 }}>
                    Transaction: {hashHint}
                </p>
            )}

            {breed.tracksEvmReceipt && breed.hash && (
                <TransactionStatus
                    hash={breed.hash}
                    onComplete={breed.onEvmReceiptComplete}
                    onError={breed.onEvmReceiptError}
                />
            )}
        </>
    );
};

export default BreedPanel;
