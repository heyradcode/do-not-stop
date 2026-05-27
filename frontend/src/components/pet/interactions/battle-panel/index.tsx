import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TransactionStatus from '@components/common/transaction-status';
import {
    getReadyPetsUnified,
    useActiveChain,
    useBattlePets,
    usePetList,
    formatSolanaActionError,
} from '@shared/core';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { Tones } from '@constants/tones';
import { useWriteContractErrorState } from '@hooks/useWriteContractErrorState';
import Icon, { BattleIcon, CheckIcon, CloseIcon, PauseIcon, WarningIcon } from '@components/common/icon';

export type BattlePanelProps = {
    /** `false` when embedded under the dashboard interactions hub. */
    isStandaloneView?: boolean;
};

const BattlePanel: React.FC<BattlePanelProps> = ({ isStandaloneView = true }) => {
    const navigate = useNavigate();
    const chain = useActiveChain();
    const isSolana = chain.kind === 'solana';
    const { pets, refetch } = usePetList();
    const { mutate, isPending, error: hookError, hash, reset } = useBattlePets();
    const readyPets = useMemo(() => getReadyPetsUnified(pets), [pets]);
    const { error, setError, isUserRejection, isContractError, resetError } = useWriteContractErrorState(hookError);

    const [selectedPet1, setSelectedPet1] = useState('');
    const [selectedPet2, setSelectedPet2] = useState('');
    const [success, setSuccess] = useState<string | null>(null);
    const [localError, setLocalError] = useState<string | null>(null);

    const displayError = isSolana ? (localError ?? hookError?.message ?? null) : error;

    const handleBattle = async () => {
        if (!selectedPet1 || !selectedPet2) {
            const message = 'Please select two pets to battle';
            if (isSolana) setLocalError(message);
            else setError(message);
            return;
        }

        resetError();
        reset();
        setLocalError(null);
        setSuccess(null);

        try {
            await mutate({ petId1: selectedPet1, petId2: selectedPet2 });
            if (isSolana) {
                setSuccess('Battle completed! Check your pets for level ups.');
                setSelectedPet1('');
                setSelectedPet2('');
                void refetch();
                navigate(DASHBOARD_HOME);
            }
        } catch (err) {
            if (isSolana) {
                setLocalError(formatSolanaActionError(err, 'Failed to start battle. Please try again.'));
            } else {
                setError('Failed to start battle. Please try again.');
            }
            console.error('Battle failed:', err);
        }
    };

    const handleCancel = () => {
        setSuccess(null);
        navigate(DASHBOARD_HOME);
    };

    const handleTransactionComplete = () => {
        setSuccess('Battle completed! Check your pets for level ups.');
        setSelectedPet1('');
        setSelectedPet2('');
        resetError();
        void refetch();
        navigate(DASHBOARD_HOME);
    };

    const pendingLabel = isSolana ? 'Generating randomness…' : 'Starting Battle...';

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4><Icon as={BattleIcon} tone={Tones.Magenta} />Battle Pets</h4>
                        <p>
                            {isSolana
                                ? 'Select two pets to battle (Switchboard VRF)'
                                : 'Select two pets to battle'}
                        </p>
                    </>
                )}

                <div className="picker">
                    <div className="field">
                        <label>First Fighter</label>
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
                        <label>Second Fighter</label>
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

                <div className="action-controls">
                    <button
                        type="button"
                        onClick={() => void handleBattle()}
                        disabled={isPending || !selectedPet1 || !selectedPet2}
                    >
                        {isPending ? pendingLabel : 'Start Battle'}
                    </button>
                    <button type="button" onClick={handleCancel} className="cancel-button">
                        Cancel
                    </button>
                </div>
            </div>

            {displayError && (
                <div
                    className={`error-message ${isUserRejection ? 'user-rejection' : ''} ${isContractError || isSolana ? 'contract-error' : ''}`}
                >
                    <Icon
                        as={isUserRejection ? PauseIcon : isContractError || isSolana ? WarningIcon : CloseIcon}
                        tone={isUserRejection ? Tones.Inherit : isContractError || isSolana ? Tones.Amber : Tones.Magenta}
                    />
                    {displayError}
                </div>
            )}

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                </div>
            )}

            {isSolana && hash && (
                <p className="breed-pending-hint" style={{ marginTop: '0.75rem', fontSize: '0.9rem', opacity: 0.85 }}>
                    Transaction: {hash.slice(0, 8)}…
                </p>
            )}

            {!isSolana && (
                <TransactionStatus hash={hash} onComplete={handleTransactionComplete} onError={(e) => setError(e.message)} />
            )}
        </>
    );
};

export default BattlePanel;
