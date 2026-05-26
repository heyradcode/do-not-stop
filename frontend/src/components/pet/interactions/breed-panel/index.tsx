import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { parseEventLogs } from 'viem';
import TransactionStatus from '@components/common/transaction-status';
import {
    useActiveChain,
    usePetsContract,
    useWatchPetsContract,
    type BreedSuccessPayload,
    getReadyPets,
} from '@shared/core';
import { petsContractParams } from '@/petsContractParams';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { useWriteContractErrorState } from '@hooks/useWriteContractErrorState';
import Icon, { CheckIcon, CloseIcon, DnaIcon, PauseIcon, WarningIcon } from '@components/common/icon';

export type BreedPanelProps = {
    /** `false` when embedded under the dashboard interactions hub. */
    isStandaloneView?: boolean;
};

const BreedPanel: React.FC<BreedPanelProps> = ({ isStandaloneView = true }) => {
    const navigate = useNavigate();
    const chain = useActiveChain();
    const { address } = useAccount();

    const {
        requestBreedFromDNA,
        petIds,
        pets,
        isReady,
        hash,
        isPending,
        writeError,
        refetchPetIds,
    } = usePetsContract(petsContractParams);

    const readyPets = useMemo(() => getReadyPets(petIds, pets, isReady), [petIds, pets, isReady]);
    const { error, setError, isUserRejection, isContractError, resetError } = useWriteContractErrorState(writeError);

    const [selectedPet1, setSelectedPet1] = useState<bigint | null>(null);
    const [selectedPet2, setSelectedPet2] = useState<bigint | null>(null);
    const [newPetName, setNewPetName] = useState('');
    const [success, setSuccess] = useState<string | null>(null);
    const [pendingRequestId, setPendingRequestId] = useState<bigint | null>(null);

    const offspringNameRef = useRef('');

    if (chain.kind === 'solana') {
        return (
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4><Icon as={DnaIcon} tone="emerald" />Breed Pets</h4>
                        <p>Breeding is not yet supported on Solana.</p>
                    </>
                )}
                <div className="action-controls">
                    <button type="button" onClick={() => navigate(DASHBOARD_HOME)} className="cancel-button">
                        Back to dashboard
                    </button>
                </div>
            </div>
        );
    }

    const { data: requestReceipt } = useWaitForTransactionReceipt({
        hash: hash as `0x${string}` | undefined,
    });

    useEffect(() => {
        if (!requestReceipt || !hash || !address) return;
        try {
            const logs = parseEventLogs({
                abi: petsContractParams.abi,
                logs: requestReceipt.logs,
                eventName: 'BreedRandomnessRequested',
                strict: false,
            }) as unknown as {
                args: { owner?: string; requestId?: bigint };
            }[];
            const mine = logs.find(
                (l) => l.args.owner?.toLowerCase() === address.toLowerCase()
            );
            const rid = mine?.args.requestId;
            if (rid != null) setPendingRequestId(rid);
        } catch {
            /* not a breed tx or ABI mismatch */
        }
    }, [requestReceipt, hash, address]);

    const handleBreedSuccess = useCallback((_payload: BreedSuccessPayload) => {
        setSuccess(`Pet "${offspringNameRef.current}" created successfully!`);
        setSelectedPet1(null);
        setSelectedPet2(null);
        setNewPetName('');
        resetError();
        setPendingRequestId(null);
        navigate(DASHBOARD_HOME);
        void refetchPetIds();
    }, [navigate, refetchPetIds, resetError]);

    useWatchPetsContract({
        contractAddress: petsContractParams.contractAddress,
        abi: petsContractParams.abi,
        address: address as `0x${string}` | undefined,
        pendingRequestId,
        onBreedSuccess: handleBreedSuccess,
    });

    const handleBreed = () => {
        if (!selectedPet1 || !selectedPet2 || !newPetName.trim()) {
            setError('Please select two pets and enter a name for the offspring');
            return;
        }

        resetError();
        setSuccess(null);
        setPendingRequestId(null);
        offspringNameRef.current = newPetName.trim();

        try {
            requestBreedFromDNA(selectedPet1, selectedPet2, newPetName.trim());
        } catch (err) {
            setError('Failed to breed pets. Please try again.');
            console.error('Error breeding pets:', err);
        }
    };

    const handleCancel = () => {
        setSuccess(null);
        setPendingRequestId(null);
        navigate(DASHBOARD_HOME);
    };

    const handleTransactionComplete = () => {
        /* VRF: navigation happens on BreedFulfilled, not when the request tx confirms */
    };

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4><Icon as={DnaIcon} tone="emerald" />Breed Pets</h4>
                        <p>Select two pets to create a new one</p>
                    </>
                )}

                <div className="picker">
                    <div className="field">
                        <label>First Parent</label>
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
                        <label>Second Parent</label>
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
                        disabled={
                            isPending ||
                            !selectedPet1 ||
                            !selectedPet2 ||
                            !newPetName.trim() ||
                            pendingRequestId != null
                        }
                    >
                        {isPending ? 'Submitting…' : pendingRequestId != null ? 'Creating…' : 'Breed Pets'}
                    </button>
                    <button type="button" onClick={handleCancel} className="cancel-button">
                        Cancel
                    </button>
                </div>

                {pendingRequestId != null && (
                    <p className="breed-pending-hint" style={{ marginTop: '0.75rem', fontSize: '0.9rem', opacity: 0.85 }}>
                        Hang tight—your new pet will show up in a moment.
                    </p>
                )}
            </div>

            {error && (
                <div
                    className={`error-message ${isUserRejection ? 'user-rejection' : ''} ${isContractError ? 'contract-error' : ''}`}
                >
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

            <TransactionStatus hash={hash} onComplete={handleTransactionComplete} onError={(e) => setError(e.message)} />
        </>
    );
};

export default BreedPanel;
