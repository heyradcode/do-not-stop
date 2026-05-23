import React, { useEffect, useState } from 'react';
import {
    parseContractError,
    useActiveChain,
    useCreatePet,
    usePetList,
} from '@shared/core';
import TransactionStatus from '../ui/TransactionStatus';
import './CreatePetModal.css';

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
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>🐾 Create Your First Pet</h2>
                    <button className="close-button" onClick={handleClose}>
                        ×
                    </button>
                </div>

                <div className="modal-body">
                    <p>Give your pet a unique name and bring it to life! You can only create one pet initially — breed to grow your collection!</p>

                    <div className="creator-form">
                        <div className="input-group">
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
                            className="create-button"
                        >
                            {isPending ? 'Creating...' : 'Create Pet'}
                        </button>
                    </div>

                    {error && (
                        <div className={`error-message ${isUserRejection ? 'user-rejection' : ''} ${isContractError ? 'contract-error' : ''}`}>
                            {isUserRejection ? '⏸️' : isContractError ? '⚠️' : '❌'} {error}
                        </div>
                    )}

                    {success && (
                        <div className="success-message">
                            ✅ {success}
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
