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
    getPetSkill,
    getRarityColor,
    getRarityName,
    getTimeUntilReady,
    isPetReady,
    useChainCapabilities,
    usePetList,
    type Pet,
} from '@shared/core';
import { Tones } from '@constants/tones';
import Icon, {
    CloseIcon,
    CrystalIcon,
    DragonIcon,
    EggIcon,
    MagicIcon,
    PawIcon,
    SendIcon,
    SparklesIcon,
} from '@components/ui/icon';
import CreatePetModal from '@components/pet/creation/create-pet-modal';
import PetCollectionLayout from '@components/pet/collection/pet-collection-layout';
import SendPetModal from '@components/pet/transfer/send-pet-modal';
import { useNotifyError } from '@hooks/useNotifyError';
import './index.css';

const PetGallery: React.FC = () => {
    const { isConnected } = useChainCapabilities();
    const { pets, isLoading, error, refetch } = usePetList();
    const notifyError = useNotifyError();
    const [loading, setLoading] = useState(false);
    const [sendModalOpen, setSendModalOpen] = useState(false);
    const [, setTick] = useState(0);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [sendSelection, setSendSelection] = useState<{ pet: Pet; petId: bigint } | null>(null);

    useEffect(() => {
        setLoading(isLoading);
    }, [isLoading]);

    // Tick every second while any pet is on cooldown so the countdown stays live.
    const anyCooldown = pets.some(
        (p) =>
            !isPetReady(BigInt(p.readyAt)) ||
            (p.breedReadyAt != null && !isPetReady(BigInt(p.breedReadyAt))) ||
            (p.trainReadyAt != null && !isPetReady(BigInt(p.trainReadyAt))),
    );
    useEffect(() => {
        if (!anyCooldown) return;
        const id = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(id);
    }, [anyCooldown]);

    useEffect(() => {
        if (!error) return;
        notifyError('Failed to load pet data. Please try again.', error, 'pet-list');
    }, [error, notifyError]);

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
                title={
                    <>
                        <Icon as={PawIcon} tone={Tones.Cyan} />
                        Your Pet Collection
                    </>
                }
                description="Connect your wallet to view your pets"
            />
        );
    }

    return (
        <>
            <PetCollectionLayout
                title={
                    <>
                        <Icon as={PawIcon} tone={Tones.Cyan} />
                        Your Pets
                    </>
                }
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
                        <p>
                            <Icon as={CloseIcon} tone={Tones.Magenta} />
                            Failed to load pet data. Please try again.
                        </p>
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
                            <span className="orb orb-tl">
                                <Icon
                                    as={CrystalIcon}
                                    tone={Tones.Cyan}
                                    glow="strong"
                                    className="no-gap"
                                />
                            </span>
                            <span className="orb orb-tr">
                                <Icon
                                    as={SparklesIcon}
                                    tone={Tones.Magenta}
                                    glow="strong"
                                    className="no-gap"
                                />
                            </span>
                            <span className="orb orb-bl">
                                <Icon
                                    as={EggIcon}
                                    tone={Tones.Amber}
                                    glow="strong"
                                    className="no-gap"
                                />
                            </span>
                            <span className="orb orb-br">
                                <Icon
                                    as={MagicIcon}
                                    tone={Tones.Violet}
                                    glow="strong"
                                    className="no-gap"
                                />
                            </span>
                            <span className="core">
                                <Icon
                                    as={DragonIcon}
                                    tone={Tones.Violet}
                                    glow="strong"
                                    className="no-gap"
                                />
                            </span>
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
                            <Icon as={PawIcon} tone={Tones.Cyan} />
                            Create your first pet
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
                                    {getPetSkill(pet.speciesId) ? (
                                        <div
                                            className="skill-badge"
                                            title={getPetSkill(pet.speciesId)?.description}
                                        >
                                            {getPetSkill(pet.speciesId)?.name}
                                        </div>
                                    ) : null}
                                    <div className="pet-avatar">{getPetAvatar(pet.dna)}</div>
                                    <div className="level-badge">Lv. {pet.level}</div>
                                </div>

                                <div className="pet-main-info">
                                    <div className="pet-header">
                                        <h3>{pet.name}</h3>
                                        <span className="pet-dna">
                                            {getPetClass(pet.dna)} · Gen{' '}
                                            {pet.generation ?? getGeneration(pet.dna)}
                                        </span>
                                    </div>
                                    <div className="xp-row">
                                        <span className="xp-label">XP</span>
                                        <span className="xp-value">
                                            {getXpNumbers(pet).xpCurrent}/{getXpNumbers(pet).xpMax}
                                        </span>
                                    </div>
                                    <div className="xp-bar">
                                        <div
                                            className="xp-fill"
                                            style={{ width: `${getXpPercent(pet)}%` }}
                                        />
                                    </div>
                                    {(pet.winCount > 0 ||
                                        pet.lossCount > 0 ||
                                        (pet.breedCount != null && pet.breedCount > 0)) && (
                                        <div className="pet-record">
                                            <span className="record-wins">{pet.winCount}W</span>
                                            <span className="record-sep">/</span>
                                            <span className="record-losses">{pet.lossCount}L</span>
                                            {pet.breedCount != null && pet.breedCount > 0 && (
                                                <span className="record-breeds">
                                                    · {pet.breedCount} bred
                                                </span>
                                            )}
                                        </div>
                                    )}
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

                                {(!isPetReady(BigInt(pet.readyAt)) ||
                                    (pet.breedReadyAt != null &&
                                        !isPetReady(BigInt(pet.breedReadyAt))) ||
                                    (pet.trainReadyAt != null &&
                                        !isPetReady(BigInt(pet.trainReadyAt)))) && (
                                    <div className="pet-status">
                                        {!isPetReady(BigInt(pet.readyAt)) && (
                                            <div className="status cooldown">
                                                ⚔️ Battle ready in{' '}
                                                {getTimeUntilReady(BigInt(pet.readyAt))}
                                            </div>
                                        )}
                                        {pet.breedReadyAt != null &&
                                            !isPetReady(BigInt(pet.breedReadyAt)) && (
                                                <div className="status cooldown">
                                                    🥚 Breed ready in{' '}
                                                    {getTimeUntilReady(BigInt(pet.breedReadyAt))}
                                                </div>
                                            )}
                                        {pet.trainReadyAt != null &&
                                            !isPetReady(BigInt(pet.trainReadyAt)) && (
                                                <div className="status cooldown">
                                                    💪 Train ready in{' '}
                                                    {getTimeUntilReady(BigInt(pet.trainReadyAt))}
                                                </div>
                                            )}
                                    </div>
                                )}

                                <div className="pet-actions">
                                    <button
                                        type="button"
                                        className={`send-button${
                                            isPetReady(BigInt(pet.readyAt))
                                                ? ' is-ready'
                                                : ' on-cooldown'
                                        }`}
                                        onClick={() => handleSendClick(pet)}
                                    >
                                        <Icon
                                            as={SendIcon}
                                            tone={
                                                isPetReady(BigInt(pet.readyAt))
                                                    ? Tones.Emerald
                                                    : Tones.Amber
                                            }
                                        />
                                        Send
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
