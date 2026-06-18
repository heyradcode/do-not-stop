import React, { useCallback, useEffect, useMemo, useState } from 'react';
import TransactionStatus from '@components/common/transaction-status';
import { useChainCapabilities, useBreedPets, useFees, useMarriageInfo, usePendingBreed, usePetList } from '@shared/core';
import { Tones } from '@constants/tones';
import { AuthActionButton } from '@components/common';
import { formatTxHashHint } from '@hooks/usePetError';
import { usePetErrorToast } from '@hooks/usePetErrorToast';
import PendingBreedNotice from './pending-breed-notice';
import Icon, { CheckIcon, DnaIcon } from '@components/ui/icon';

export type BreedPanelProps = {
    /** `false` when embedded under the dashboard interactions hub. */
    isStandaloneView?: boolean;
};

const VALIDATION_MESSAGE = 'Please select two pets and enter a name for the offspring';
const BREED_FAIL_MESSAGE = 'Failed to breed pets. Please try again.';
const AWAITING_HINT = 'Hang tight—your new pet will show up in a moment.';

const BreedPanel: React.FC<BreedPanelProps> = ({ isStandaloneView = true }) => {
    const { randomness } = useChainCapabilities();
    const { pets, refetch } = usePetList();
    const [selectedPet1, setSelectedPet1] = useState('');
    const [selectedPet2, setSelectedPet2] = useState('');
    const [newPetName, setNewPetName] = useState('');
    const [success, setSuccess] = useState<string | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [breedWithSpouse, setBreedWithSpouse] = useState(false);

    const fees = useFees();

    // Show all user pets — cooldowns are enforced by the contract, not the UI.
    // Filtering here was hiding married pets that happened to be on battle cooldown.
    const breedablePets = useMemo(
        () => pets.map((pet) => ({ id: pet.id, pet })),
        [pets],
    );

    // Cross-owner (married) breeding: first parent must be married; request carries a stud fee.
    // useMarriageInfo expects a Pet object — look it up from breedablePets.
    const selectedPet1Object = breedablePets.find(({ id }) => id === selectedPet1)?.pet;
    const marriage = useMarriageInfo(selectedPet1Object);
    const spouseId = marriage.isMarried ? marriage.spouseId?.toString() : undefined;
    const crossOwner = breedWithSpouse && Boolean(spouseId);
    const effectiveParent2 = crossOwner ? (spouseId as string) : selectedPet2;

    // Auto-enable spouse breeding when a married pet is selected; reset when not married.
    useEffect(() => {
        setBreedWithSpouse(marriage.isMarried && Boolean(spouseId));
    }, [marriage.isMarried, spouseId]);

    const studFeeLabel = useMemo(() => {
        if (!crossOwner || fees.studFee == null) return null;
        return `+${fees.formatAmount(fees.studFee)} stud fee`;
    }, [crossOwner, fees]);

    // An unresolved breed on either parent makes requestCreateFromDNA revert
    // ("Breed pending for parent"); block a new breed until it's resolved
    // (the PendingBreedNotice below drives settle/cancel).
    const pendingP1 = usePendingBreed(selectedPet1 || undefined);
    const pendingP2 = usePendingBreed(effectiveParent2 || undefined);
    const hasPendingBreed = pendingP1.isPending || pendingP2.isPending;

    const handleSuccess = useCallback(
        ({ name }: { name: string }) => {
            setSuccess(`Pet "${name}" created successfully!`);
            setSelectedPet1('');
            setSelectedPet2('');
            setNewPetName('');
            void refetch();
        },
        [refetch]
    );

    const breed = useBreedPets({ onSuccess: handleSuccess });

    // Receipt errors are folded into `breed.error` by the chain adapter.
    usePetErrorToast(
        breed.error,
        null,
        validationError,
        BREED_FAIL_MESSAGE,
    );

    const usesSwitchboardVrf = randomness.provider === 'switchboard';
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
    const hashHint = usesSwitchboardVrf ? formatTxHashHint(breed.hash) : null;

    const canSubmit = Boolean(selectedPet1 && effectiveParent2 && newPetName.trim());

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
            parentId2: effectiveParent2,
            name: newPetName.trim(),
            crossOwner,
        });
    };

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
                            {breedablePets.map(({ id, pet }) => (
                                <option key={id} value={id}>
                                    {pet.name} (Level {pet.level})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="field">
                        <label>Second Parent</label>
                        {crossOwner ? (
                            <input type="text" value={`Spouse #${spouseId}`} readOnly />
                        ) : (
                            <select
                                value={selectedPet2}
                                onChange={(e) => setSelectedPet2(e.target.value)}
                            >
                                <option value="">Select pet...</option>
                                {breedablePets
                                    .filter(({ id }) => id !== selectedPet1)
                                    .map(({ id, pet }) => (
                                        <option key={id} value={id}>
                                            {pet.name} (Level {pet.level})
                                        </option>
                                    ))}
                            </select>
                        )}
                    </div>
                </div>

                {marriage.isMarried && spouseId && (
                    <label className="breed-spouse-toggle">
                        <input
                            type="checkbox"
                            checked={breedWithSpouse}
                            onChange={(e) => setBreedWithSpouse(e.target.checked)}
                        />
                        {' '}Breed with spouse #{spouseId} (cross-owner{studFeeLabel ? `, ${studFeeLabel}` : ''})
                    </label>
                )}

                <PendingBreedNotice petId={selectedPet1} label={`#${selectedPet1}`} />
                {effectiveParent2 ? <PendingBreedNotice petId={effectiveParent2} label={`#${effectiveParent2}`} /> : null}

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
                    <AuthActionButton
                        onClick={handleBreed}
                        disabled={breed.isPending || breed.isAwaitingFulfillment || hasPendingBreed}
                    >
                        {buttonLabel}
                    </AuthActionButton>
                </div>

                {breed.isAwaitingFulfillment && (
                    <p className="pending-hint">
                        {AWAITING_HINT}
                    </p>
                )}
            </div>

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                </div>
            )}

            {hashHint && (
                <p className="pending-hint">
                    Transaction: {hashHint}
                </p>
            )}

            <TransactionStatus lifecycle={breed.lifecycle} />
        </>
    );
};

export default BreedPanel;
