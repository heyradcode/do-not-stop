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
import Icon, {
    CloseIcon,
    CrystalIcon,
    DragonIcon,
    EggIcon,
    MagicIcon,
    PawIcon,
    SendIcon,
    SparklesIcon,
} from '../../common/icon';
import CreatePetModal from '../create-pet-modal';
import PetCollectionLayout from '../pet-collection-layout';
import SendPetModal from '../send-pet-modal';
import './index.css';

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
                className="wallet-disconnected"
                title={<><Icon as={PawIcon} tone="cyan" />Your Pet Collection</>}
                description="Connect your wallet to view your pets"
            />
        );
    }

    return (
        <>
            <PetCollectionLayout
                title={<><Icon as={PawIcon} tone="cyan" />Your Pets</>}
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
                        <p><Icon as={CloseIcon} tone="magenta" />{error.message || 'Failed to load pet data'}</p>
                        <button type="button" onClick={() => refetch()} className="retry-button">
                            Try Again
                        </button>
                    </div>
                )}

                {!loading && !error && pets.length === 0 && (
                    <div className="empty-state">
                        <div className="altar" aria-hidden>
                            <span className="ring ring-outer" />
                            <span className="ring ring-mid" />
                            <span className="ring ring-inner" />
                            <span className="orb orb-tl"><Icon as={CrystalIcon} tone="cyan" glow="strong" className="no-gap" /></span>
                            <span className="orb orb-tr"><Icon as={SparklesIcon} tone="magenta" glow="strong" className="no-gap" /></span>
                            <span className="orb orb-bl"><Icon as={EggIcon} tone="amber" glow="strong" className="no-gap" /></span>
                            <span className="orb orb-br"><Icon as={MagicIcon} tone="violet" glow="strong" className="no-gap" /></span>
                            <span className="core"><Icon as={DragonIcon} tone="violet" glow="strong" className="no-gap" /></span>
                        </div>
                        <div className="empty-copy">
                            <h3>Awaken your first companion</h3>
                            <p>Step into the altar — name a pet and bring it to life.</p>
                        </div>
                        <button
                            type="button"
                            className="create-first-pet-button"
                            onClick={() => setCreateModalOpen(true)}
                        >
                            <Icon as={PawIcon} tone="cyan" />Create your first pet
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

                                {!isPetReady(BigInt(pet.readyAt)) && (
                                    <div className="pet-status">
                                        <div className="status cooldown">
                                            ⏰ Ready in {getTimeUntilReady(BigInt(pet.readyAt))}
                                        </div>
                                    </div>
                                )}

                                <div className="pet-actions">
                                    <button
                                        type="button"
                                        className={`send-button${isPetReady(BigInt(pet.readyAt)) ? ' is-ready' : ' on-cooldown'}`}
                                        onClick={() => handleSendClick(pet)}
                                    >
                                        <Icon as={SendIcon} tone={isPetReady(BigInt(pet.readyAt)) ? 'emerald' : 'amber'} />Send
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
