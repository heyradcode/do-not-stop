import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChainCapabilities, useCreatePet, useFees } from '@shared/core';
import { Tones } from '@constants/tones';
import Icon, { CheckIcon, PawIcon } from '@components/ui/icon';
import NeonButton from '@components/ui/neon-button';
import NeonModal from '@components/ui/neon-modal';
import TransactionStatus from '@components/common/transaction-status';
import { useNotifyError } from '@hooks/useNotifyError';
import { useTxErrorToast } from '@hooks/useTxErrorToast';
import './index.css';

interface CreatePetModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CreatePetModal: React.FC<CreatePetModalProps> = ({ isOpen, onClose }) => {
    const { isConnected } = useChainCapabilities();
    const queryClient = useQueryClient();
    const notifyError = useNotifyError();

    // Mint cost escalates per wallet: EVM baseMintFee×(1+count), Solana baseMintFee<<min(count,7).
    const fees = useFees();
    const mintCost = fees.nextMintFee != null ? fees.formatAmount(fees.nextMintFee) : null;

    const [petName, setPetName] = useState('');
    const [success, setSuccess] = useState<string | null>(null);

    // Settlement is lifecycle-driven (EVM: receipt confirmed; Solana: resolve).
    const handleCreateComplete = () => {
        setSuccess(`Pet "${petName.trim()}" created successfully!`);
        setPetName('');
        // Bust the entire contract-read cache so the gallery picks up the new pet
        // immediately — avoids stale reads when the wallet's chain differs from
        // the contract's chain (useReadContracts overwrites chainId with the wallet's).
        void queryClient.invalidateQueries({ queryKey: ['readContract'] });
        void queryClient.invalidateQueries({ queryKey: ['readContracts'] });
        onClose();
    };

    const {
        mutate,
        isPending,
        isAwaitingFulfillment,
        isSettling,
        error: hookError,
        reset,
        lifecycle,
    } = useCreatePet({
        onSuccess: handleCreateComplete,
    });

    useTxErrorToast(hookError);

    const isInProgress = isPending || isAwaitingFulfillment || isSettling;
    // EVM: both nextMintFee (via mintCost) AND entropyFee must be loaded before sending.
    // Solana: no entropy fee, mintCost alone is sufficient.
    const isEvm = fees.symbol === 'ETH';
    const feesLoading = mintCost == null || (isEvm && fees.entropyFee == null);

    const buttonLabel = isPending
        ? 'Submitting...'
        : isAwaitingFulfillment
        ? 'Awaiting randomness...'
        : isSettling
        ? 'Settling mint...'
        : feesLoading
        ? 'Loading fees...'
        : `Create Pet (${mintCost})`;

    const handleCreatePet = async () => {
        if (!isConnected) {
            notifyError('Please connect your wallet first', undefined, 'create-pet-validation');
            return;
        }

        const trimmed = petName.trim();
        if (!trimmed) {
            notifyError('Please enter a pet name', undefined, 'create-pet-validation');
            return;
        }

        setSuccess(null);

        try {
            await mutate({ name: trimmed });
        } catch (err) {
            console.error('[create-pet]', err);
        }
    };

    const handleClose = () => {
        if (isInProgress) return; // don't discard an in-flight mint — the fee is already spent
        setPetName('');
        setSuccess(null);
        reset();
        onClose();
    };

    return (
        <NeonModal
            isOpen={isOpen}
            onRequestClose={handleClose}
            title={
                <>
                    <Icon as={PawIcon} tone={Tones.Cyan} />
                    Create Your First Pet
                </>
            }
            contentClassName="create-pet-body"
        >
            <p>
                Give your pet a unique name and bring it to life! You can only create one pet
                initially — breed to grow your collection!
            </p>

            <div className="form">
                <div className="field">
                    <label htmlFor="petName">Pet Name</label>
                    <input
                        id="petName"
                        type="text"
                        value={petName}
                        onChange={(e) => setPetName(e.target.value)}
                        placeholder="Enter pet name..."
                        maxLength={20}
                        disabled={isInProgress}
                    />
                </div>

                {mintCost && <p className="mint-cost">Mint cost: {mintCost}</p>}

                {/* Creating a pet is fully on-chain (Switchboard VRF + program) and
                    needs no backend session — gate on wallet connection only, not SIWS auth. */}
                <NeonButton
                    tone="cyan"
                    onClick={handleCreatePet}
                    disabled={isInProgress || feesLoading || !petName.trim() || !isConnected}
                >
                    {buttonLabel}
                </NeonButton>

                {isAwaitingFulfillment && (
                    <p className="pending-hint">
                        Hang tight — your pet will appear once randomness is revealed.
                    </p>
                )}
            </div>

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                </div>
            )}

            <TransactionStatus lifecycle={lifecycle} />
        </NeonModal>
    );
};

export default CreatePetModal;
