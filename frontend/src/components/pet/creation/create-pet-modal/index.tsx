import React, { useEffect, useState } from 'react';
import {
    useActiveChain,
    useCreatePet,
    usePetList,
} from '@shared/core';
import { Tones } from '@constants/tones';
import Icon, { CheckIcon, PawIcon } from '@components/ui/icon';
import TransactionStatus from '@components/common/transaction-status';
import { useNotifyError, useNotifyReceiptError } from '@hooks/useNotifyError';
import { useTxErrorToast } from '@hooks/useTxErrorToast';
import './index.css';

interface CreatePetModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CreatePetModal: React.FC<CreatePetModalProps> = ({ isOpen, onClose }) => {
    const chain = useActiveChain();
    const isConnected = chain.kind !== 'none';
    const { mutate, isPending, error: hookError, hash, reset } = useCreatePet();
    const { refetch } = usePetList();
    const notifyError = useNotifyError();
    const notifyReceiptError = useNotifyReceiptError();

    useTxErrorToast(hookError);

    const [petName, setPetName] = useState('');
    const [success, setSuccess] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | undefined>(undefined);

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

            if (chain.kind === 'solana') {
                setSuccess(`Pet "${trimmed}" created successfully!`);
                setPetName('');
                refetch();
                onClose();
            }
        } catch (err) {
            console.error('[create-pet]', err);
        }
    };

    const handleSuccess = () => {
        setSuccess(`Pet "${petName}" created successfully!`);
        setPetName('');
    };

    const handleTransactionComplete = () => {
        handleSuccess();
        onClose();
        setTxHash(undefined);
        refetch();
    };

    const handleClose = () => {
        setPetName('');
        setSuccess(null);
        setTxHash(undefined);
        reset();
        onClose();
    };

    useEffect(() => {
        if (hash && chain.kind === 'evm') {
            setTxHash(hash);
        }
    }, [hash, chain.kind]);

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

                        <button
                            onClick={handleCreatePet}
                            disabled={isPending || !petName.trim() || !isConnected}
                            className="submit"
                        >
                            {isPending ? 'Creating...' : 'Create Pet'}
                        </button>
                    </div>

                    {success && (
                        <div className="success-message">
                            <Icon as={CheckIcon} tone={Tones.Emerald} />
                            {success}
                        </div>
                    )}

                    {chain.kind === 'evm' && (
                        <TransactionStatus
                            hash={txHash}
                            onComplete={handleTransactionComplete}
                            onError={(error) => {
                                notifyReceiptError(error);
                                setTxHash(undefined);
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default CreatePetModal;
