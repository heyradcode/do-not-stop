import React, { useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import TransactionStatus from './TransactionStatus';
import './ZombieCreator.css';

const ZombieCreator: React.FC = () => {
    const { address, isConnected } = useAccount();
    const [zombieName, setZombieName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isUserRejection, setIsUserRejection] = useState(false);

    const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();

    const handleCreateZombie = async () => {
        if (!isConnected || !address) {
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

        try {
            await writeContract({
                address: '0x5FbDB2315678afecb367f032d93F642f64180aa3', // Contract address from deployment
                abi: [
                    {
                        name: 'createRandomZombie',
                        type: 'function',
                        inputs: [{ name: '_name', type: 'string' }],
                        outputs: [],
                        stateMutability: 'nonpayable',
                    },
                ],
                functionName: 'createRandomZombie',
                args: [zombieName.trim()],
            });
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
            // Handle user rejection gracefully
            if (writeError.message?.includes('User rejected') ||
                writeError.message?.includes('User denied') ||
                writeError.message?.includes('rejected')) {
                setError('Transaction cancelled by user');
                setIsUserRejection(true);
            } else {
                setError('Transaction failed. Please try again.');
                setIsUserRejection(false);
            }
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
                <p>Give your zombie a unique name and bring it to life!</p>

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
                    <div className={`error-message ${isUserRejection ? 'user-rejection' : ''}`}>
                        {isUserRejection ? '⏸️' : '❌'} {error}
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
