import React, { useEffect, useState } from 'react';
import {
    parseContractError,
    useActiveChain,
    useCreatePet,
    usePetList,
} from '@shared/core';
import Icon, { CheckIcon, CloseIcon, PauseIcon, PawIcon, WarningIcon } from '../common/Icon';
import TransactionStatus from '../ui/TransactionStatus';
import './PetCreator.css';

const PetCreator: React.FC = () => {
    const chain = useActiveChain();
    const isConnected = chain.kind !== 'none';
    const { mutate, isPending, error: hookError, hash } = useCreatePet();
    const { refetch } = usePetList();

    const [petName, setPetName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isUserRejection, setIsUserRejection] = useState(false);
    const [isContractError, setIsContractError] = useState(false);

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
            }
        } catch (err) {
            console.error('Error creating pet:', err);
        }
    };

    const handleTransactionComplete = () => {
        setSuccess(`Pet "${petName}" created successfully!`);
        setPetName('');
        refetch();
    };

    useEffect(() => {
        if (hookError) {
            const parsed = parseContractError(hookError);
            setError(parsed.message);
            setIsUserRejection(parsed.isUserRejection);
            setIsContractError(parsed.isContractError);
        }
    }, [hookError]);

    if (!isConnected) {
        return (
            <div className="pet-creator">
                <div className="creator-card">
                    <h3><Icon as={PawIcon} tone="cyan" />Create Your First Pet</h3>
                    <p>Connect your wallet to start creating pets!</p>
                </div>
            </div>
        );
    }

    return (
        <div className="pet-creator">
            <div className="creator-card">
                <h3><Icon as={PawIcon} tone="cyan" />Create Your First Pet</h3>
                <p>Give your pet a unique name and bring it to life! You can only create one pet initially — breed to grow your collection!</p>

                <div className="creator-form">
                    <div className="input-group">
                        <label htmlFor="petNameCreator">Pet Name</label>
                        <input
                            id="petNameCreator"
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
                        disabled={isPending || !petName.trim()}
                        className="create-button"
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
                        hash={hash}
                        onComplete={handleTransactionComplete}
                        onError={(error) => setError(error.message)}
                    />
                )}
            </div>
        </div>
    );
};

export default PetCreator;
