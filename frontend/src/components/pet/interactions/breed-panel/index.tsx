import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { parseEventLogs } from 'viem';
import TransactionStatus from '@components/common/transaction-status';
import {
    useActiveChain,
    useBreedPets,
    usePetList,
    usePetsContract,
    useWatchPetsContract,
    type BreedSuccessPayload,
    getReadyPets,
    getReadyPetsUnified,
    formatSolanaActionError,
} from '@shared/core';
import { petsContractParams } from '@/petsContractParams';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { Tones } from '@constants/tones';
import { useWriteContractErrorState } from '@hooks/useWriteContractErrorState';
import Icon, { CheckIcon, CloseIcon, DnaIcon, PauseIcon, WarningIcon } from '@components/common/icon';

export type BreedPanelProps = {
    /** `false` when embedded under the dashboard interactions hub. */
    isStandaloneView?: boolean;
};

const SolanaBreedPanel: React.FC<BreedPanelProps> = ({ isStandaloneView = true }) => {
    const navigate = useNavigate();
    const { pets, refetch } = usePetList();
    const { mutate, isPending, error, hash } = useBreedPets();
    const readyPets = useMemo(() => getReadyPetsUnified(pets), [pets]);
    const [selectedPet1, setSelectedPet1] = useState<string | null>(null);
    const [selectedPet2, setSelectedPet2] = useState<string | null>(null);
    const [newPetName, setNewPetName] = useState('');
    const [success, setSuccess] = useState<string | null>(null);
    const [localError, setLocalError] = useState<string | null>(null);

    const handleBreed = async () => {
        if (!selectedPet1 || !selectedPet2 || !newPetName.trim()) {
            setLocalError('Please select two pets and enter a name for the offspring');
            return;
        }
        setLocalError(null);
        setSuccess(null);
        try {
            await mutate({
                parentId1: selectedPet1,
                parentId2: selectedPet2,
                name: newPetName.trim(),
            });
            setSuccess(`Pet "${newPetName.trim()}" created successfully!`);
            setSelectedPet1(null);
            setSelectedPet2(null);
            setNewPetName('');
            void refetch();
            navigate(DASHBOARD_HOME);
        } catch (err) {
            setLocalError(formatSolanaActionError(err, 'Failed to breed pets. Please try again.'));
            console.error('Solana breed failed:', err);
        }
    };

    const displayError = localError ?? error?.message ?? null;

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4><Icon as={DnaIcon} tone={Tones.Emerald} />Breed Pets</h4>
                        <p>Select two pets to create a new one (Switchboard VRF)</p>
                    </>
                )}
                <div className="picker">
                    <div className="field">
                        <label>First Parent</label>
                        <select
                            value={selectedPet1 ?? ''}
                            onChange={(e) => setSelectedPet1(e.target.value || null)}
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
                            value={selectedPet2 ?? ''}
                            onChange={(e) => setSelectedPet2(e.target.value || null)}
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
                        onClick={() => void handleBreed()}
                        disabled={isPending || !selectedPet1 || !selectedPet2 || !newPetName.trim()}
                    >
                        {isPending ? 'Generating randomness…' : 'Breed Pets'}
                    </button>
                    <button type="button" onClick={() => navigate(DASHBOARD_HOME)} className="cancel-button">
                        Cancel
                    </button>
                </div>
            </div>
            {displayError && (
                <div className="error-message contract-error">
                    <Icon as={WarningIcon} tone={Tones.Amber} />
                    {displayError}
                </div>
            )}
            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                </div>
            )}
            {hash && (
                <p className="breed-pending-hint" style={{ marginTop: '0.75rem', fontSize: '0.9rem', opacity: 0.85 }}>
                    Transaction: {hash.slice(0, 8)}…
                </p>
            )}
        </>
    );
};

const EvmBreedPanel: React.FC<BreedPanelProps> = ({ isStandaloneView = true }) => {
    const navigate = useNavigate();
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

    // EVM-only flow below. Called unconditionally to satisfy rules-of-hooks;
    // each hook self-defends via `address`/`hash` guards so it no-ops on Solana.
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
                        <h4><Icon as={DnaIcon} tone={Tones.Emerald} />Breed Pets</h4>
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
                        tone={isUserRejection ? Tones.Inherit : isContractError ? Tones.Amber : Tones.Magenta}
                    />
                    {error}
                </div>
            )}

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                </div>
            )}

            <TransactionStatus hash={hash} onComplete={handleTransactionComplete} onError={(e) => setError(e.message)} />
        </>
    );
};

const BreedPanel: React.FC<BreedPanelProps> = (props) => {
    const chain = useActiveChain();
    if (chain.kind === 'solana') {
        return <SolanaBreedPanel {...props} />;
    }
    return <EvmBreedPanel {...props} />;
};

export default BreedPanel;
