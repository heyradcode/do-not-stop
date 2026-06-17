import React, { useState } from 'react';
import {
    useChainCapabilities,
    useCreatePet,
    useFees,
    usePetList,
} from '@shared/core';
import { Tones } from '@constants/tones';
import Icon, { CheckIcon, PawIcon } from '@components/ui/icon';
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
    const { refetch } = usePetList();
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
        refetch();
        onClose();
    };

    const { mutate, isPending, error: hookError, reset, lifecycle } = useCreatePet({
        onSuccess: handleCreateComplete,
    });

    useTxErrorToast(hookError);

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
        setPetName('');
        setSuccess(null);
        reset();
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="create-pet-modal" onClick={handleClose}>
            <div className="dialog" onClick={(e) => e.stopPropagation()}>
                <div className="header">
                    <h2><Icon as={PawIcon} tone={Tones.Cyan} />Create Your First Pet</h2>
                    <button className="close" onClick={handleClose}>
                        ×
                    </button>
                </div>

                <div className="body">
                    <p>Give your pet a unique name and bring it to life! You can only create one pet initially — breed to grow your collection!</p>

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
                                disabled={isPending}
                            />
                        </div>

                        {mintCost && (
                            <p className="mint-cost">Mint cost: {mintCost}</p>
                        )}

                        <button
                            onClick={handleCreatePet}
                            disabled={isPending || !petName.trim() || !isConnected}
                            className="submit"
                        >
                            {isPending
                                ? 'Creating...'
                                : mintCost ? `Create Pet (${mintCost})` : 'Create Pet'}
                        </button>
                    </div>

                    {success && (
                        <div className="success-message">
                            <Icon as={CheckIcon} tone={Tones.Emerald} />
                            {success}
                        </div>
                    )}

                    <TransactionStatus lifecycle={lifecycle} />
                </div>
            </div>
        </div>
    );
};

export default CreatePetModal;
