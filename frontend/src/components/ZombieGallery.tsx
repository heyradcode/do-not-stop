import React, { useState, useEffect } from 'react';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { CONTRACT_ADDRESS } from '../config';
import './ZombieGallery.css';

interface Zombie {
    name: string;
    dna: bigint;
    level: number;
    readyTime: bigint;
    winCount: number;
    lossCount: number;
    rarity: number;
}

const ZombieGallery: React.FC = () => {
    const { address, isConnected } = useAccount();
    const [zombies, setZombies] = useState<Zombie[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Get zombie IDs owned by the user
    const { data: zombieIdsData, refetch: refetchZombieIds, error: zombieIdsError } = useReadContract({
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
        query: {
            enabled: !!address,
        },
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
            setLoading(false);
        } else if (zombiesError) {
            setError('Failed to load zombie data');
            setLoading(false);
        } else if (zombieIdsData && zombieIdsData.length === 0) {
            setZombies([]);
            setLoading(false);
        }
    }, [zombiesData, zombiesError, zombieIdsData, zombieContracts.length]);

    // Set loading state
    useEffect(() => {
        if (zombieIdsData && zombieIdsData.length > 0) {
            setLoading(isZombiesLoading);
        }
    }, [isZombiesLoading, zombieIdsData]);

    const getRarityColor = (rarity: number): string => {
        switch (rarity) {
            case 1: return '#6c757d'; // Common - Gray
            case 2: return '#28a745'; // Uncommon - Green
            case 3: return '#007bff'; // Rare - Blue
            case 4: return '#6f42c1'; // Epic - Purple
            case 5: return '#fd7e14'; // Legendary - Orange
            default: return '#6c757d';
        }
    };

    const getRarityName = (rarity: number): string => {
        switch (rarity) {
            case 1: return 'Common';
            case 2: return 'Uncommon';
            case 3: return 'Rare';
            case 4: return 'Epic';
            case 5: return 'Legendary';
            default: return 'Unknown';
        }
    };

    const isReady = (readyTime: bigint): boolean => {
        return Date.now() / 1000 >= Number(readyTime);
    };

    const getTimeUntilReady = (readyTime: bigint): string => {
        const now = Date.now() / 1000;
        const ready = Number(readyTime);
        const diff = ready - now;

        if (diff <= 0) return 'Ready!';

        const hours = Math.floor(diff / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = Math.floor(diff % 60);

        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
    };

    if (!isConnected) {
        return (
            <div className="zombie-gallery">
                <div className="gallery-header">
                    <h2>🧟‍♂️ Your Zombie Collection</h2>
                    <p>Connect your wallet to view your zombies</p>
                </div>
            </div>
        );
    }

    return (
        <div className="zombie-gallery">
            <div className="gallery-header">
                <h2>🧟‍♂️ Your Zombie Collection</h2>
                <p>{zombies.length} zombie{zombies.length !== 1 ? 's' : ''} in your collection</p>
                <button
                    onClick={() => refetchZombieIds()}
                    className="refresh-button"
                    disabled={loading}
                >
                    {loading ? 'Loading...' : 'Refresh'}
                </button>
            </div>

            {loading && (
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p>Loading your zombies...</p>
                </div>
            )}

            {error && (
                <div className="error-container">
                    <p>❌ {error}</p>
                    <button onClick={() => refetchZombieIds()} className="retry-button">
                        Try Again
                    </button>
                </div>
            )}

            {!loading && !error && zombies.length === 0 && (
                <div className="empty-state">
                    <div className="empty-icon">🧟‍♂️</div>
                    <h3>No zombies yet!</h3>
                    <p>Create your first zombie to get started</p>
                </div>
            )}

            {!loading && !error && zombies.length > 0 && (
                <div className="zombie-grid">
                    {zombies.map((zombie, index) => (
                        <div key={index} className="zombie-card">
                            <div className="zombie-header">
                                <h3>{zombie.name}</h3>
                                <div
                                    className="rarity-badge"
                                    style={{ backgroundColor: getRarityColor(zombie.rarity) }}
                                >
                                    {getRarityName(zombie.rarity)}
                                </div>
                            </div>

                            <div className="zombie-stats">
                                <div className="stat">
                                    <span className="stat-label">Level</span>
                                    <span className="stat-value">{zombie.level}</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">DNA</span>
                                    <span className="stat-value">{zombie.dna.toString()}</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">Wins</span>
                                    <span className="stat-value">{zombie.winCount}</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">Losses</span>
                                    <span className="stat-value">{zombie.lossCount}</span>
                                </div>
                            </div>

                            <div className="zombie-status">
                                {isReady(zombie.readyTime) ? (
                                    <div className="status ready">
                                        ✅ Ready for action!
                                    </div>
                                ) : (
                                    <div className="status cooldown">
                                        ⏰ Ready in {getTimeUntilReady(zombie.readyTime)}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ZombieGallery;
