import React, { useEffect, useState } from 'react';
import {
    parseContractError,
    useActiveChain,
    useCreatePet,
    usePetList,
} from '@shared/core';
import Icon, { CheckIcon, CloseIcon, PauseIcon, PawIcon, WarningIcon } from '@components/common/icon';
import TransactionStatus from '@components/ui/transaction-status';
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

    const [petName, setPetName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isUserRejection, setIsUserRejection] = useState(false);
    const [isContractError, setIsContractError] = useState(false);
    const [txHash, setTxHash] = useState<string | undefined>(undefined);

    const handleCreatePet = async () => {
        if (!isConnected) {
            setError('Please connect your wallet first');
            return;
        }

        const trimmed = petName.trim();
        if (!trimmed) {
            setError('Please enter a pet name');
            return;
        }

        setError(null);
        setSuccess(null);
        setIsUserRejection(false);
        setIsContractError(false);

        try {
            await mutate({ name: trimmed });

            if (chain.kind === 'solana') {
                setSuccess(`Pet "${trimmed}" created successfully!`);
                setPetName('');
                refetch();
                onClose();
            }
        } catch (err) {
            console.error('Error creating pet:', err);
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
        setError(null);
        setSuccess(null);
        setIsUserRejection(false);
        setIsContractError(false);
        setTxHash(undefined);
        reset();
        onClose();
    };

    useEffect(() => {
        if (hash && chain.kind === 'evm') {
            setTxHash(hash);
        }
    }, [hash, chain.kind]);

    useEffect(() => {
        if (hookError) {
            const parsed = parseContractError(hookError);
            setError(parsed.message);
            setIsUserRejection(parsed.isUserRejection);
            setIsContractError(parsed.isContractError);
        }
    }, [hookError]);

    if (!isOpen) return null;

    return (
        <div className="create-pet-modal" onClick={handleClose}>
            <div className="dialog" onClick={(e) => e.stopPropagation()}>
                <div className="header">
                    <h2><Icon as={PawIcon} tone="cyan" />Create Your First Pet</h2>
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

                    {error && (
                        <div className={`error-message ${isUserRejection ? 'user-rejection' : ''} ${isContractError ? 'contract-error' : ''}`}>
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

                    {chain.kind === 'evm' && (
                        <TransactionStatus
                            hash={txHash}
                            onComplete={handleTransactionComplete}
                            onError={(error) => {
                                setError(error.message);
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
