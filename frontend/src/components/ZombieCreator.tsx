import React, { useState } from 'react';
import TransactionStatus from './TransactionStatus';
import { useZombiesContract } from '../hooks/useZombiesContract';
import { parseContractError } from '../utils/errorParser';
import './ZombieCreator.css';

const ZombieCreator: React.FC = () => {
    const { isConnected, createRandomZombie, hash, isPending, writeError } = useZombiesContract();
    const [zombieName, setZombieName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isUserRejection, setIsUserRejection] = useState(false);
    const [isContractError, setIsContractError] = useState(false);

    const handleCreateZombie = async () => {
        if (!isConnected) {
            setError('Please connect your wallet first');
            return;
        }

        if (!zombieName.trim()) {
            setError('Please enter a zombie name');
            return;
        }

        setError(null);
        setSuccess(null);
        setIsUserRejection(false);
        setIsContractError(false);

        try {
            await createRandomZombie(zombieName.trim());
        } catch (err) {
            setError('Failed to create zombie. Please try again.');
            console.error('Error creating zombie:', err);
        }
    };

    const handleSuccess = () => {
        setSuccess(`Zombie "${zombieName}" created successfully!`);
        setZombieName('');
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
            <div className="zombie-creator">
                <div className="creator-card">
                    <h3>🧟‍♂️ Create Your First Zombie</h3>
                    <p>Connect your wallet to start creating zombies!</p>
                </div>
            </div>
        );
    }

    return (
        <div className="zombie-creator">
            <div className="creator-card">
                <h3>🧟‍♂️ Create Your First Zombie</h3>
                <p>Give your zombie a unique name and bring it to life! You can only create one zombie initially - breed it to create more!</p>

                <div className="creator-form">
                    <div className="input-group">
                        <label htmlFor="zombieName">Zombie Name</label>
                        <input
                            id="zombieName"
                            type="text"
                            value={zombieName}
                            onChange={(e) => setZombieName(e.target.value)}
                            placeholder="Enter zombie name..."
                            maxLength={20}
                            disabled={isPending}
                        />
                    </div>

                    <button
                        onClick={handleCreateZombie}
                        disabled={isPending || !zombieName.trim()}
                        className="create-button"
                    >
                        {isPending ? 'Creating...' : 'Create Zombie'}
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

export default ZombieCreator;
