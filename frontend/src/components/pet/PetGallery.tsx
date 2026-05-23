import React, { useState, useEffect } from 'react';
import {
    getGeneration,
    getPropertyEmoji,
    getXpNumbers,
    getXpPercent,
    getPetAvatar,
    getPetClass,
    getPetElement,
    getPetProperties,
    getRarityColor,
    getRarityName,
    getTimeUntilReady,
    isPetReady,
    useActiveChain,
    usePetList,
    type Pet,
} from '@shared/core';
import CreatePetModal from './CreatePetModal';
import PetCollectionLayout from './PetCollectionLayout';
import SendPetModal from './SendPetModal';
import './PetGallery.css';

const PetGallery: React.FC = () => {
    const chain = useActiveChain();
    const isConnected = chain.kind !== 'none';
    const { pets, isLoading, error, refetch } = usePetList();
    const [loading, setLoading] = useState(false);
    const [sendModalOpen, setSendModalOpen] = useState(false);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [sendSelection, setSendSelection] = useState<{ pet: Pet; petId: bigint } | null>(null);

    useEffect(() => {
        setLoading(isLoading);
    }, [isLoading]);

    const handleSendClick = (pet: Pet) => {
        setSendSelection({ pet, petId: BigInt(pet.id) });
        setSendModalOpen(true);
    };

    const handleCloseModal = () => {
        setSendModalOpen(false);
        setSendSelection(null);
    };

    if (!isConnected) {
        return (
            <PetCollectionLayout
                title="🐾 Your Pet Collection"
                description="Connect your wallet to view your pets"
            />
        );
    }

    return (
        <>
            <PetCollectionLayout
                title="🐾 Your Pets"
                actions={
                    <button
                        type="button"
                        onClick={() => refetch()}
                        className="refresh"
                        disabled={loading}
                        title={loading ? 'Loading...' : 'Refresh'}
                    >
                        {loading ? '⟳' : '↻'}
                    </button>
                }
            >
                {loading && (
                    <div className="loading-container">
                        <div className="loading-spinner"></div>
                        <p>Loading your pets...</p>
                    </div>
                )}

                {error && (
                    <div className="error-container">
                        <p>❌ {error.message || 'Failed to load pet data'}</p>
                        <button type="button" onClick={() => refetch()} className="retry-button">
                            Try Again
                        </button>
                    </div>
                )}

                {!loading && !error && pets.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-icon">🐾</div>
                        <h3>No pets yet!</h3>
                    </div>
                )}

                {!loading && !error && pets.length === 0 && (
                    <div className="create-button-container">
                        <button
                            type="button"
                            className="create-first-pet-button"
                            onClick={() => setCreateModalOpen(true)}
                        >
                            🐾 Create your first pet
                        </button>
                    </div>
                )}

                {!loading && !error && pets.length > 0 && (
                    <div className="pet-grid">
                        {pets.map((pet) => (
                            <div key={`${pet.chain}-${pet.id}`} className="pet-card">
                                <div className="pet-visual">
                                    <div
                                        className="rarity-badge"
                                        style={{ backgroundColor: getRarityColor(pet.rarity) }}
                                    >
                                        {getRarityName(pet.rarity)}
                                    </div>
                                    <div className="element-tag">{getPetElement(pet.dna)}</div>
                                    <div className="pet-avatar">{getPetAvatar(pet.dna)}</div>
                                    <div className="level-badge">Lv. {pet.level}</div>
                                </div>

                                <div className="pet-main-info">
                                    <div className="pet-header">
                                        <h3>{pet.name}</h3>
                                        <span className="pet-dna">
                                            {getPetClass(pet.dna)} · Gen {getGeneration(pet.dna)}
                                        </span>
                                    </div>
                                    <div className="xp-row">
                                        <span className="xp-label">XP</span>
                                        <span className="xp-value">
                                            {getXpNumbers(pet).xpCurrent}/{getXpNumbers(pet).xpMax}
                                        </span>
                                    </div>
                                    <div className="xp-bar">
                                        <div className="xp-fill" style={{ width: `${getXpPercent(pet)}%` }} />
                                    </div>
                                </div>

                                <div className="pet-properties">
                                    {Object.entries(getPetProperties(pet)).map(([key, value]) => (
                                        <div className="property-item" key={key}>
                                            <span className="property-name" title={key}>
                                                {getPropertyEmoji(key)}
                                            </span>
                                            <span className="property-value">{value}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="pet-status">
                                    {isPetReady(BigInt(pet.readyAt)) ? (
                                        <div className="status ready">✅ Ready for action!</div>
                                    ) : (
                                        <div className="status cooldown">
                                            ⏰ Ready in {getTimeUntilReady(BigInt(pet.readyAt))}
                                        </div>
                                    )}
                                </div>

                                <div className="pet-actions">
                                    <button
                                        type="button"
                                        className="send-button"
                                        onClick={() => handleSendClick(pet)}
                                    >
                                        📤 Send
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </PetCollectionLayout>

            {sendModalOpen && sendSelection && (
                <SendPetModal
                    isOpen={sendModalOpen}
                    onClose={handleCloseModal}
                    pet={sendSelection.pet}
                    petId={sendSelection.petId}
                />
            )}

            <CreatePetModal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} />
        </>
    );
};

export default PetGallery;
