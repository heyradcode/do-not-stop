import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    getGeneration,
    getLifePercent,
    getPetAvatar,
    getPetClass,
    getPetProperties,
    getPetSkill,
    getRarityColor,
    getRarityName,
    getXpNumbers,
    getXpPercent,
    useChainCapabilities,
    usePetList,
    type Pet,
} from '@shared/core';
import { BATTLE_PATH } from '@constants/interactionRoutes';
import { Tones } from '@constants/tones';
import Icon, { BattleIcon, CloseIcon, PawIcon, SendIcon } from '@components/ui/icon';
import NeonButton from '@components/ui/neon-button';
import CreatePetModal from '@components/pet/creation/create-pet-modal';
import SendPetModal from '@components/pet/transfer/send-pet-modal';
import { useNotifyError } from '@hooks/useNotifyError';
import { usePetCooldowns } from '@hooks/usePetCooldowns';
import './index.css';

/** Placeholder leaderboard rows — pending real ranking data (plan §8 Q3). */
const LEADERBOARD_PLACEHOLDER = [
    { rank: 1, name: 'CryptoKing', wins: 842, tier: 'Diamond', me: false },
    { rank: 2, name: 'DragonMstr', wins: 721, tier: 'Diamond', me: false },
    { rank: 3, name: 'You', wins: 649, tier: 'Gold', me: true },
    { rank: 4, name: 'PetLegend', wins: 511, tier: 'Gold', me: false },
    { rank: 5, name: 'BreedKing', wins: 402, tier: 'Platinum', me: false },
] as const;

/** Four stat tiles derived from the pet's DNA properties. AGI has no backing in
 *  the data model, so the fourth tile shows VIT (life); see plan §8 Q2. */
const petStatTiles = (pet: Pet): { label: string; value: number }[] => {
    const p = getPetProperties(pet);
    return [
        { label: 'STR', value: p.attack },
        { label: 'INT', value: p.intelligence },
        { label: 'DEF', value: p.defense },
        { label: 'VIT', value: p.life },
    ];
};

const winRatio = (pet: Pet): number => {
    const total = pet.winCount + pet.lossCount;
    return total === 0 ? 0 : Math.round((pet.winCount / total) * 100);
};

const PetGallery: React.FC = () => {
    const navigate = useNavigate();
    const { isConnected } = useChainCapabilities();
    const { pets, isLoading, error, refetch } = usePetList();
    const notifyError = useNotifyError();
    const [sendModalOpen, setSendModalOpen] = useState(false);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [sendSelection, setSendSelection] = useState<{ pet: Pet; petId: bigint } | null>(null);

    const { statusFor } = usePetCooldowns(pets);

    const totalWins = useMemo(
        () => pets.reduce((sum, pet) => sum + (pet.winCount ?? 0), 0),
        [pets],
    );

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
            <div className="cp-idle cp-idle--message">
                <div className="cp-idle__prompt">
                    <Icon as={PawIcon} tone={Tones.Cyan} glow="strong" noGap />
                    <h2>Your Pet Collection</h2>
                    <p>Connect your wallet to view your pets.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="cp-idle">
            {/* Stat strip — Pets & Wins are real; Global rank is a placeholder */}
            <div className="cp-idle__stats">
                <div className="cp-stat cp-stat--cyan">
                    <span className="cp-stat__icon" aria-hidden>
                        🐾
                    </span>
                    <div className="cp-stat__body">
                        <div className="cp-stat__value">{pets.length}</div>
                        <div className="cp-stat__label">Pets</div>
                    </div>
                </div>
                <div className="cp-stat cp-stat--violet">
                    <span className="cp-stat__icon" aria-hidden>
                        ⚔
                    </span>
                    <div className="cp-stat__body">
                        <div className="cp-stat__value">{totalWins}</div>
                        <div className="cp-stat__label">Wins</div>
                    </div>
                </div>
                <div className="cp-stat cp-stat--gold">
                    <span className="cp-stat__icon" aria-hidden>
                        🏆
                    </span>
                    <div className="cp-stat__body">
                        <div className="cp-stat__value">#3</div>
                        <div className="cp-stat__label">Global Rank</div>
                    </div>
                </div>
            </div>

            {/* Leaderboard — full-width row below the stats (placeholder ranking data) */}
            <div className="cp-leaderboard">
                <div className="cp-leaderboard__title">🏆 Leaderboard</div>
                <ul className="cp-leaderboard__list">
                    {LEADERBOARD_PLACEHOLDER.map((row) => (
                        <li key={row.rank} className={`cp-lb-row${row.me ? ' is-me' : ''}`}>
                            <span className="cp-lb-row__rank">#{row.rank}</span>
                            <span className="cp-lb-row__name">{row.name}</span>
                            <span className="cp-lb-row__tier">{row.tier}</span>
                        </li>
                    ))}
                </ul>
            </div>

            {isLoading && (
                <div className="loading-container">
                    <div className="loading-spinner" />
                    <p>Loading your pets...</p>
                </div>
            )}

            {error && !isLoading && (
                <div className="error-container">
                    <p>
                        <Icon as={CloseIcon} tone={Tones.Magenta} />
                        Failed to load pet data. Please try again.
                    </p>
                    <NeonButton tone="magenta" size="sm" onClick={() => refetch()}>
                        Try Again
                    </NeonButton>
                </div>
            )}

            {!isLoading && !error && (
                <div className="cp-pet-grid">
                    {pets.map((pet) => {
                        const cd = statusFor(pet);
                        const rarityColor = getRarityColor(pet.rarity);
                        const xp = getXpNumbers(pet);
                        const skill = getPetSkill(pet.speciesId);
                        return (
                            <div key={`${pet.chain}-${pet.id}`} className="cp-pet-card">
                                <div
                                    className="cp-pet-card__rarity-bar"
                                    style={{
                                        background: rarityColor,
                                        boxShadow: `0 0 8px ${rarityColor}`,
                                    }}
                                />
                                <div className="cp-pet-card__visual">
                                    <div
                                        className="cp-pet-card__rarity"
                                        style={{ color: rarityColor, borderColor: rarityColor }}
                                    >
                                        {getRarityName(pet.rarity)}
                                    </div>
                                    <div className="cp-pet-card__level">Lv. {pet.level}</div>
                                    {skill ? (
                                        <div
                                            className="cp-pet-card__skill"
                                            title={skill.description}
                                        >
                                            {skill.name}
                                        </div>
                                    ) : null}
                                    <div className="cp-pet-card__avatar">
                                        {getPetAvatar(pet.dna)}
                                    </div>
                                </div>

                                <div className="cp-pet-card__info">
                                    <div className="cp-pet-card__head">
                                        <div>
                                            <div className="cp-pet-card__name">{pet.name}</div>
                                            <div className="cp-pet-card__class">
                                                {getPetClass(pet.dna)} · Gen{' '}
                                                {pet.generation ?? getGeneration(pet.dna)}
                                            </div>
                                        </div>
                                        <div className="cp-pet-card__hp">
                                            <span className="cp-pet-card__hp-label">HP</span>
                                            <span className="cp-pet-card__hp-value">
                                                {getLifePercent(pet)}%
                                            </span>
                                        </div>
                                    </div>

                                    <div className="cp-pet-card__xp">
                                        <div className="cp-pet-card__xp-row">
                                            <span className="cp-pet-card__xp-label">XP</span>
                                            <span className="cp-pet-card__xp-value">
                                                {xp.xpCurrent}/{xp.xpMax}
                                            </span>
                                        </div>
                                        <div className="cp-pet-card__xp-track">
                                            <div
                                                className="cp-pet-card__xp-fill"
                                                style={{ width: `${getXpPercent(pet)}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="cp-pet-card__record">
                                        <span className="cp-pet-card__wins">{pet.winCount}W</span>
                                        <span className="cp-pet-card__sep">/</span>
                                        <span className="cp-pet-card__losses">
                                            {pet.lossCount}L
                                        </span>
                                        <span className="cp-pet-card__dot">·</span>
                                        <span className="cp-pet-card__wr">{winRatio(pet)}% WR</span>
                                    </div>
                                </div>

                                <div className="cp-pet-card__stats">
                                    {petStatTiles(pet).map((s) => (
                                        <div className="cp-stat-tile" key={s.label}>
                                            <div className="cp-stat-tile__label">{s.label}</div>
                                            <div className="cp-stat-tile__value">{s.value}</div>
                                        </div>
                                    ))}
                                </div>

                                {cd.onCooldown && (
                                    <div className="cp-pet-card__status">
                                        {cd.battleOnCooldown && (
                                            <div className="cp-cooldown">
                                                ⚔️ Battle ready in {cd.battleLabel}
                                            </div>
                                        )}
                                        {cd.breedOnCooldown && (
                                            <div className="cp-cooldown">
                                                🥚 Breed ready in {cd.breedLabel}
                                            </div>
                                        )}
                                        {cd.trainOnCooldown && (
                                            <div className="cp-cooldown">
                                                💪 Train ready in {cd.trainLabel}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="cp-pet-card__actions">
                                    <button
                                        type="button"
                                        className="cp-pet-card__battle"
                                        onClick={() => navigate(BATTLE_PATH)}
                                    >
                                        <Icon
                                            as={BattleIcon}
                                            tone={Tones.Magenta}
                                            glow="none"
                                            noGap
                                        />
                                        Battle
                                    </button>
                                    <button
                                        type="button"
                                        className={`cp-pet-card__send${
                                            cd.battleReady ? ' is-ready' : ' on-cooldown'
                                        }`}
                                        onClick={() => handleSendClick(pet)}
                                        title="Send / transfer pet"
                                        aria-label={`Send ${pet.name}`}
                                    >
                                        <Icon
                                            as={SendIcon}
                                            tone={cd.battleReady ? Tones.Emerald : Tones.Amber}
                                            glow="none"
                                            noGap
                                        />
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    <button
                        type="button"
                        className="cp-summon-tile"
                        onClick={() => setCreateModalOpen(true)}
                    >
                        <span className="cp-summon-tile__plus">+</span>
                        <span className="cp-summon-tile__label">Summon a Pet</span>
                    </button>
                </div>
            )}

            {sendModalOpen && sendSelection && (
                <SendPetModal
                    isOpen={sendModalOpen}
                    onClose={handleCloseModal}
                    pet={sendSelection.pet}
                    petId={sendSelection.petId}
                />
            )}

            <CreatePetModal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} />
        </div>
    );
};

export default PetGallery;
