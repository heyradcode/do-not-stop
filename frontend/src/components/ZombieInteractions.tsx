import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useReadContract, useReadContracts } from 'wagmi';
import TransactionStatus from './TransactionStatus';
import { CONTRACT_ADDRESS } from '../config';
import { parseContractError } from '../utils/errorParser';
import './ZombieInteractions.css';

interface Zombie {
    name: string;
    dna: bigint;
    level: number;
    readyTime: bigint;
    winCount: number;
    lossCount: number;
    rarity: number;
}

const ZombieInteractions: React.FC = () => {
    const { address, isConnected } = useAccount();
    const [zombies, setZombies] = useState<Zombie[]>([]);
    const [zombieIds, setZombieIds] = useState<bigint[]>([]);
    const [selectedZombie1, setSelectedZombie1] = useState<bigint | null>(null);
    const [selectedZombie2, setSelectedZombie2] = useState<bigint | null>(null);
    const [newZombieName, setNewZombieName] = useState('');
    const [action, setAction] = useState<'breed' | 'battle' | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isUserRejection, setIsUserRejection] = useState(false);
    const [isContractError, setIsContractError] = useState(false);

    const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();

    // Get zombie IDs owned by the user
    const { data: zombieIdsData, refetch: refetchZombieIds } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: [
            {
                name: 'getZombiesByOwner',
                type: 'function',
                inputs: [{ name: '_owner', type: 'address' }],
                outputs: [{ name: '', type: 'uint256[]' }],
                stateMutability: 'view',
            },
        ],
        functionName: 'getZombiesByOwner',
        args: address ? [address] : undefined,
        query: { enabled: !!address },
    });

    // Create contracts array for batch reading zombie data
    const zombieContracts = zombieIdsData?.map((zombieId: bigint) => ({
        address: CONTRACT_ADDRESS as const,
        abi: [
            {
                name: 'getZombie',
                type: 'function',
                inputs: [{ name: '_zombieId', type: 'uint256' }],
                outputs: [
                    {
                        name: '',
                        type: 'tuple',
                        components: [
                            { name: 'name', type: 'string' },
                            { name: 'dna', type: 'uint256' },
                            { name: 'level', type: 'uint32' },
                            { name: 'readyTime', type: 'uint32' },
                            { name: 'winCount', type: 'uint16' },
                            { name: 'lossCount', type: 'uint16' },
                            { name: 'rarity', type: 'uint8' },
                        ],
                    },
                ],
                stateMutability: 'view',
            },
        ] as const,
        functionName: 'getZombie' as const,
        args: [zombieId],
    })) || [];

    // Batch read all zombie data
    const { data: zombiesData, isLoading: isZombiesLoading, error: zombiesError } = useReadContracts({
        contracts: zombieContracts,
        query: {
            enabled: zombieContracts.length > 0,
        },
    });

    // Process zombie data when it changes
    useEffect(() => {
        if (zombiesData && zombiesData.length > 0) {
            const processedZombies = zombiesData
                .filter(result => result.status === 'success' && result.result)
                .map(result => {
                    const zombieData = result.result as any;
                    return {
                        name: zombieData.name,
                        dna: BigInt(zombieData.dna),
                        level: Number(zombieData.level),
                        readyTime: BigInt(zombieData.readyTime),
                        winCount: Number(zombieData.winCount),
                        lossCount: Number(zombieData.lossCount),
                        rarity: Number(zombieData.rarity),
                    } as Zombie;
                });
            setZombies(processedZombies);
            setZombieIds(zombieIdsData || []);
            setLoading(false);
        } else if (zombiesError) {
            setError('Failed to load zombie data');
            setLoading(false);
        } else if (zombieIdsData && zombieIdsData.length === 0) {
            setZombies([]);
            setZombieIds([]);
            setLoading(false);
        }
    }, [zombiesData, zombiesError, zombieIdsData]);

    // Set loading state
    useEffect(() => {
        if (zombieIdsData && zombieIdsData.length > 0) {
            setLoading(isZombiesLoading);
        }
    }, [isZombiesLoading, zombieIdsData]);

    const isReady = (readyTime: bigint): boolean => {
        return Date.now() / 1000 >= Number(readyTime);
    };

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
            writeContract({
                address: CONTRACT_ADDRESS,
                abi: [
                    {
                        name: 'createZombieFromDNA',
                        type: 'function',
                        inputs: [
                            { name: '_zombieId1', type: 'uint256' },
                            { name: '_zombieId2', type: 'uint256' },
                            { name: '_name', type: 'string' },
                        ],
                        outputs: [],
                        stateMutability: 'nonpayable',
                    },
                ],
                functionName: 'createZombieFromDNA',
                args: [selectedZombie1, selectedZombie2, newZombieName.trim()],
                gas: 500000n, // Set gas limit to 500,000
            });
        } catch (err) {
            setError('Failed to breed zombies. Please try again.');
            console.error('Error breeding zombies:', err);
        } finally {
            setLoading(false);
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
            writeContract({
                address: CONTRACT_ADDRESS,
                abi: [
                    {
                        name: 'battleZombies',
                        type: 'function',
                        inputs: [
                            { name: '_zombieId1', type: 'uint256' },
                            { name: '_zombieId2', type: 'uint256' },
                        ],
                        outputs: [],
                        stateMutability: 'nonpayable',
                    },
                ],
                functionName: 'battleZombies',
                args: [selectedZombie1, selectedZombie2],
                gas: 300000n, // Set gas limit to 300,000
            });
        } catch (err) {
            setError('Failed to start battle. Please try again.');
            console.error('Error starting battle:', err);
        } finally {
            setLoading(false);
        }
    };

    const resetSelection = () => {
        setSelectedZombie1(null);
        setSelectedZombie2(null);
        setNewZombieName('');
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
