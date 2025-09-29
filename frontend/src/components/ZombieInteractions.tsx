import React, { useState, useEffect } from 'react';
import TransactionStatus from './TransactionStatus';
import { useZombiesContract, type Zombie } from '../hooks/useZombiesContract';
import { parseContractError } from '../utils/errorParser';
import './ZombieInteractions.css';

const ZombieInteractions: React.FC = () => {
    const {
        isConnected,
        zombies,
        zombieIds,
        isLoading,
        createZombieFromDNA,
        battleZombies,
        levelUp,
        changeName,
        hash,
        isPending,
        writeError,
        refetchZombieIds,
        isReady
    } = useZombiesContract();

    const [selectedZombie1, setSelectedZombie1] = useState<bigint | null>(null);
    const [selectedZombie2, setSelectedZombie2] = useState<bigint | null>(null);
    const [newZombieName, setNewZombieName] = useState('');
    const [action, setAction] = useState<'breed' | 'battle' | 'levelup' | 'changename' | null>(null);
    const [selectedZombie, setSelectedZombie] = useState<bigint | null>(null);
    const [newName, setNewName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isUserRejection, setIsUserRejection] = useState(false);
    const [isContractError, setIsContractError] = useState(false);

    // Set loading state
    useEffect(() => {
        setLoading(isLoading);
    }, [isLoading]);

    const getReadyZombies = (): { id: bigint; zombie: Zombie }[] => {
        return zombieIds
            .map((id, index) => ({ id, zombie: zombies[index] }))
            .filter(({ zombie }) => zombie && isReady(zombie.readyTime));
    };

    const handleBreed = async () => {
        if (!selectedZombie1 || !selectedZombie2 || !newZombieName.trim()) {
            setError('Please select two zombies and enter a name for the offspring');
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(null);
        setIsUserRejection(false);
        setIsContractError(false);

        try {
            await createZombieFromDNA(selectedZombie1, selectedZombie2, newZombieName.trim());
        } catch (err) {
            setError('Failed to breed zombies. Please try again.');
            console.error('Error breeding zombies:', err);
        }
    };

    const handleBattle = async () => {
        if (!selectedZombie1 || !selectedZombie2) {
            setError('Please select two zombies to battle');
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(null);
        setIsUserRejection(false);
        setIsContractError(false);

        try {
            await battleZombies(selectedZombie1, selectedZombie2);
        } catch (err) {
            setError('Failed to start battle. Please try again.');
            console.error('Error starting battle:', err);
        }
    };

    const handleLevelUp = async () => {
        if (!selectedZombie) {
            setError('Please select a zombie to level up');
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(null);
        setIsUserRejection(false);
        setIsContractError(false);

        try {
            await levelUp(selectedZombie);
        } catch (err) {
            setError('Failed to level up zombie. Please try again.');
            console.error('Error leveling up zombie:', err);
        }
    };

    const handleChangeName = async () => {
        if (!selectedZombie || !newName.trim()) {
            setError('Please select a zombie and enter a new name');
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(null);
        setIsUserRejection(false);
        setIsContractError(false);

        try {
            await changeName(selectedZombie, newName.trim());
        } catch (err) {
            setError('Failed to change zombie name. Please try again.');
            console.error('Error changing zombie name:', err);
        }
    };

    const resetSelection = () => {
        setSelectedZombie1(null);
        setSelectedZombie2(null);
        setSelectedZombie(null);
        setNewZombieName('');
        setNewName('');
        setAction(null);
        setError(null);
        setSuccess(null);
        setIsUserRejection(false);
        setIsContractError(false);
    };

    const handleTransactionComplete = () => {
        if (action === 'breed') {
            setSuccess(`Zombie "${newZombieName}" created successfully!`);
        } else if (action === 'battle') {
            setSuccess('Battle completed! Check your zombies for level ups.');
        } else if (action === 'levelup') {
            setSuccess('Zombie leveled up successfully!');
        } else if (action === 'changename') {
            setSuccess(`Zombie name changed to "${newName}"!`);
        }
        resetSelection();
        refetchZombieIds();
    };

    useEffect(() => {
        if (writeError) {
            const parsedError = parseContractError(writeError);
            setError(parsedError.message);
            setIsUserRejection(parsedError.isUserRejection);
            setIsContractError(parsedError.isContractError);
        }
    }, [writeError]);

    if (!isConnected) {
        return (
            <div className="zombie-interactions">
                <div className="interactions-card">
                    <h3>⚔️ Zombie Interactions</h3>
                    <p>Connect your wallet to interact with your zombies</p>
                </div>
            </div>
        );
    }

    if (loading && zombies.length === 0) {
        return (
            <div className="zombie-interactions">
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p>Loading your zombies...</p>
                </div>
            </div>
        );
    }

    if (zombies.length < 2) {
        return (
            <div className="zombie-interactions">
                <div className="interactions-card">
                    <h3>⚔️ Zombie Interactions</h3>
                    <p>You need at least 2 zombies to breed or battle</p>
                    <p className="help-text">Create your first zombie above, then breed it to create more zombies!</p>
                </div>
            </div>
        );
    }

    const readyZombies = getReadyZombies();

    return (
        <div className="zombie-interactions">
            <div className="interactions-card">
                <h3>⚔️ Zombie Interactions</h3>

                {!action && (
                    <div className="action-buttons">
                        <button
                            onClick={() => setAction('breed')}
                            className="action-button breed-button"
                            disabled={readyZombies.length < 2}
                        >
                            🧬 Breed Zombies
                        </button>
                        <button
                            onClick={() => setAction('battle')}
                            className="action-button battle-button"
                            disabled={readyZombies.length < 2}
                        >
                            ⚔️ Battle Zombies
                        </button>
                        <button
                            onClick={() => setAction('levelup')}
                            className="action-button levelup-button"
                            disabled={readyZombies.length < 1}
                        >
                            ⬆️ Level Up
                        </button>
                        <button
                            onClick={() => setAction('changename')}
                            className="action-button changename-button"
                            disabled={readyZombies.length < 1}
                        >
                            ✏️ Change Name
                        </button>
                    </div>
                )}

                {action === 'breed' && (
                    <div className="breed-interface">
                        <h4>🧬 Breed Zombies</h4>
                        <p>Select two zombies to create a new one</p>

                        <div className="zombie-selection">
                            <div className="selection-group">
                                <label>First Parent</label>
                                <select
                                    value={selectedZombie1?.toString() || ''}
                                    onChange={(e) => setSelectedZombie1(e.target.value ? BigInt(e.target.value) : null)}
                                >
                                    <option value="">Select zombie...</option>
                                    {readyZombies.map(({ id, zombie }) => (
                                        <option key={id.toString()} value={id.toString()}>
                                            {zombie.name} (Level {zombie.level})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="selection-group">
                                <label>Second Parent</label>
                                <select
                                    value={selectedZombie2?.toString() || ''}
                                    onChange={(e) => setSelectedZombie2(e.target.value ? BigInt(e.target.value) : null)}
                                >
                                    <option value="">Select zombie...</option>
                                    {readyZombies
                                        .filter(({ id }) => id !== selectedZombie1)
                                        .map(({ id, zombie }) => (
                                            <option key={id.toString()} value={id.toString()}>
                                                {zombie.name} (Level {zombie.level})
                                            </option>
                                        ))}
                                </select>
                            </div>
                        </div>

                        <div className="name-input">
                            <label>Offspring Name</label>
                            <input
                                type="text"
                                value={newZombieName}
                                onChange={(e) => setNewZombieName(e.target.value)}
                                placeholder="Enter name for the new zombie..."
                                maxLength={20}
                            />
                        </div>

                        <div className="action-controls">
                            <button onClick={handleBreed} disabled={isPending || !selectedZombie1 || !selectedZombie2 || !newZombieName.trim()}>
                                {isPending ? 'Breeding...' : 'Breed Zombies'}
                            </button>
                            <button onClick={resetSelection} className="cancel-button">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {action === 'battle' && (
                    <div className="battle-interface">
                        <h4>⚔️ Battle Zombies</h4>
                        <p>Select two zombies to battle</p>

                        <div className="zombie-selection">
                            <div className="selection-group">
                                <label>First Fighter</label>
                                <select
                                    value={selectedZombie1?.toString() || ''}
                                    onChange={(e) => setSelectedZombie1(e.target.value ? BigInt(e.target.value) : null)}
                                >
                                    <option value="">Select zombie...</option>
                                    {readyZombies.map(({ id, zombie }) => (
                                        <option key={id.toString()} value={id.toString()}>
                                            {zombie.name} (Level {zombie.level})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="selection-group">
                                <label>Second Fighter</label>
                                <select
                                    value={selectedZombie2?.toString() || ''}
                                    onChange={(e) => setSelectedZombie2(e.target.value ? BigInt(e.target.value) : null)}
                                >
                                    <option value="">Select zombie...</option>
                                    {readyZombies
                                        .filter(({ id }) => id !== selectedZombie1)
                                        .map(({ id, zombie }) => (
                                            <option key={id.toString()} value={id.toString()}>
                                                {zombie.name} (Level {zombie.level})
                                            </option>
                                        ))}
                                </select>
                            </div>
                        </div>

                        <div className="action-controls">
                            <button onClick={handleBattle} disabled={isPending || !selectedZombie1 || !selectedZombie2}>
                                {isPending ? 'Starting Battle...' : 'Start Battle'}
                            </button>
                            <button onClick={resetSelection} className="cancel-button">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {action === 'levelup' && (
                    <div className="levelup-interface">
                        <h4>⬆️ Level Up Zombie</h4>
                        <p>Pay 0.001 ETH to level up your zombie</p>

                        <div className="zombie-selection">
                            <div className="selection-group">
                                <label>Select Zombie</label>
                                <select
                                    value={selectedZombie?.toString() || ''}
                                    onChange={(e) => setSelectedZombie(e.target.value ? BigInt(e.target.value) : null)}
                                >
                                    <option value="">Select zombie...</option>
                                    {readyZombies.map(({ id, zombie }) => (
                                        <option key={id.toString()} value={id.toString()}>
                                            {zombie.name} (Level {zombie.level})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="action-controls">
                            <button onClick={handleLevelUp} disabled={isPending || !selectedZombie}>
                                {isPending ? 'Leveling Up...' : 'Level Up (0.001 ETH)'}
                            </button>
                            <button onClick={resetSelection} className="cancel-button">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {action === 'changename' && (
                    <div className="changename-interface">
                        <h4>✏️ Change Zombie Name</h4>
                        <p>Change your zombie's name (requires level 2+)</p>

                        <div className="zombie-selection">
                            <div className="selection-group">
                                <label>Select Zombie</label>
                                <select
                                    value={selectedZombie?.toString() || ''}
                                    onChange={(e) => setSelectedZombie(e.target.value ? BigInt(e.target.value) : null)}
                                >
                                    <option value="">Select zombie...</option>
                                    {readyZombies
                                        .filter(({ zombie }) => zombie.level >= 2)
                                        .map(({ id, zombie }) => (
                                            <option key={id.toString()} value={id.toString()}>
                                                {zombie.name} (Level {zombie.level})
                                            </option>
                                        ))}
                                </select>
                            </div>

                            <div className="selection-group">
                                <label>New Name</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Enter new name..."
                                    maxLength={20}
                                />
                            </div>
                        </div>

                        <div className="action-controls">
                            <button onClick={handleChangeName} disabled={isPending || !selectedZombie || !newName.trim()}>
                                {isPending ? 'Changing Name...' : 'Change Name'}
                            </button>
                            <button onClick={resetSelection} className="cancel-button">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

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

export default ZombieInteractions;
