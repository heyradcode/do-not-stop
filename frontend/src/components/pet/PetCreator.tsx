import React, { useState } from 'react';
import TransactionStatus from '../ui/TransactionStatus';
import { usePetsContract } from '@shared/core';
import { petsContractParams } from '../../petsContractParams';
import { parseContractError } from '@shared/core';
import './PetCreator.css';

const PetCreator: React.FC = () => {
    const { isConnected, createRandomPet, hash, isPending, writeError } = usePetsContract(petsContractParams);
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

        if (!petName.trim()) {
            setError('Please enter a pet name');
            return;
        }

        setError(null);
        setSuccess(null);
        setIsUserRejection(false);
        setIsContractError(false);

        try {
            await createRandomPet(petName.trim());
        } catch (err) {
            setError('Failed to create pet. Please try again.');
            console.error('Error creating pet:', err);
        }
    };

    const handleSuccess = () => {
        setSuccess(`Pet "${petName}" created successfully!`);
        setPetName('');
    };

    const handleTransactionComplete = () => {
        handleSuccess();
    };

    React.useEffect(() => {
        if (writeError) {
            const parsedError = parseContractError(writeError);
            setError(parsedError.message);
            setIsUserRejection(parsedError.isUserRejection);
            setIsContractError(parsedError.isContractError);
        }
    }, [writeError]);

    if (!isConnected) {
        return (
            <div className="pet-creator">
                <div className="creator-card">
                    <h3>🐾 Create Your First Pet</h3>
                    <p>Connect your wallet to start creating pets!</p>
                </div>
            </div>
        );
    }

    return (
        <div className="pet-creator">
            <div className="creator-card">
                <h3>🐾 Create Your First Pet</h3>
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
                        {isUserRejection ? '⏸️' : isContractError ? '⚠️' : '❌'} {error}
                    </div>
                )}

                {success && (
                    <div className="success-message">
                        ✅ {success}
                    </div>
                )}

                <TransactionStatus
                    hash={hash}
                    onComplete={handleTransactionComplete}
                    onError={(error) => setError(error.message)}
                />
            </div>
        </div>
    );
};

export default PetCreator;
