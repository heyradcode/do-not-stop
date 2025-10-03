import React, { useState, useEffect } from 'react';
import { useZombiesContract } from '../../hooks/useZombiesContract';
import CreateZombieModal from './CreateZombieModal';
import SendZombieModal from './SendZombieModal';
import './ZombieGallery.css';

const ZombieGallery: React.FC = () => {
    const { isConnected, zombies, zombieIds, isLoading, contractError, refetchZombieIds, getRarityColor, getRarityName } = useZombiesContract();
    const [loading, setLoading] = useState(false);
    const [sendModalOpen, setSendModalOpen] = useState(false);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [selectedZombie, setSelectedZombie] = useState<{ zombie: any; zombieId: bigint } | null>(null);

    // Set loading state
    useEffect(() => {
        setLoading(isLoading);
    }, [isLoading]);

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

    const handleSendClick = (zombie: any, zombieId: bigint) => {
        setSelectedZombie({ zombie, zombieId });
        setSendModalOpen(true);
    };

    const handleCloseModal = () => {
        setSendModalOpen(false);
        setSelectedZombie(null);
    };

    if (!isConnected) {
        return (
            <div className="zombie-gallery">
                <div className="gallery-card">
                    <div className="gallery-header">
                        <h2>🧟‍♂️ Your Zombie Collection</h2>
                        <p>Connect your wallet to view your zombies</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="zombie-gallery">
            <div className="gallery-card">
                <div className="gallery-header">
                    <h2>🧟‍♂️ Your Zombies</h2>
                    <button
                        onClick={() => refetchZombieIds()}
                        className="refresh-button"
                        disabled={loading}
                        title={loading ? 'Loading...' : 'Refresh'}
                    >
                        {loading ? '⟳' : '↻'}
                    </button>
                </div>

                {loading && (
                    <div className="loading-container">
                        <div className="loading-spinner"></div>
                        <p>Loading your zombies...</p>
                    </div>
                )}

                {contractError && (
                    <div className="error-container">
                        <p>❌ {contractError?.message || 'Failed to load zombie data'}</p>
                        <button onClick={() => refetchZombieIds()} className="retry-button">
                            Try Again
                        </button>
                    </div>
                )}

                {!loading && !contractError && zombies.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-icon">🧟‍♂️</div>
                        <h3>No zombies yet!</h3>
                    </div>
                )}

                {!loading && !contractError && zombies.length === 0 && (
                    <div className="create-button-container">
                        <button
                            className="create-first-zombie-button"
                            onClick={() => setCreateModalOpen(true)}
                        >
                            🧟‍♂️ Create your Zombie
                        </button>
                    </div>
                )}

                {!loading && !contractError && zombies.length > 0 && (
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

                                <div className="zombie-actions">
                                    <button
                                        className="send-button"
                                        onClick={() => handleSendClick(zombie, zombieIds[index])}
                                    >
                                        📤 Send
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {sendModalOpen && selectedZombie && (
                <SendZombieModal
                    isOpen={sendModalOpen}
                    onClose={handleCloseModal}
                    zombie={selectedZombie.zombie}
                    zombieId={selectedZombie.zombieId}
                />
            )}

            <CreateZombieModal
                isOpen={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
            />
        </div>
    );
};

export default ZombieGallery;
