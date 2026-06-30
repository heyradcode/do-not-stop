import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
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
import s from './index.module.css';

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
            <div className={clsx(s.idle, s.idleMessage)}>
                <div className={s.prompt}>
                    <Icon as={PawIcon} tone={Tones.Cyan} glow="strong" noGap />
                    <h2>Your Pet Collection</h2>
                    <p>Connect your wallet to view your pets.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={s.idle}>
            {/* Stat strip — Pets & Wins are real; Global rank is a placeholder */}
            <div className={s.stats}>
                <div className={clsx(s.stat, s.cyan)}>
                    <span className={s.statIcon} aria-hidden>
                        🐾
                    </span>
                    <div className={s.statBody}>
                        <div className={s.statValue}>{pets.length}</div>
                        <div className={s.statLabel}>Pets</div>
                    </div>
                </div>
                <div className={clsx(s.stat, s.violet)}>
                    <span className={s.statIcon} aria-hidden>
                        ⚔
                    </span>
                    <div className={s.statBody}>
                        <div className={s.statValue}>{totalWins}</div>
                        <div className={s.statLabel}>Wins</div>
                    </div>
                </div>
                <div className={clsx(s.stat, s.gold)}>
                    <span className={s.statIcon} aria-hidden>
                        🏆
                    </span>
                    <div className={s.statBody}>
                        <div className={s.statValue}>#3</div>
                        <div className={s.statLabel}>Global Rank</div>
                    </div>
                </div>
            </div>

            {/* Leaderboard — full-width row below the stats (placeholder ranking data) */}
            <div className={s.leaderboard}>
                <div className={s.leaderboardTitle}>🏆 Leaderboard</div>
                <ul className={s.leaderboardList}>
                    {LEADERBOARD_PLACEHOLDER.map((row) => (
                        <li key={row.rank} className={clsx(s.lbRow, row.me && s.isMe)}>
                            <span className={s.lbRank}>#{row.rank}</span>
                            <span className={s.lbName}>{row.name}</span>
                            <span className={s.lbTier}>{row.tier}</span>
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
                <div className={s.petGrid}>
                    {pets.map((pet) => {
                        const cd = statusFor(pet);
                        const rarityColor = getRarityColor(pet.rarity);
                        const xp = getXpNumbers(pet);
                        const skill = getPetSkill(pet.speciesId);
                        return (
                            <div key={`${pet.chain}-${pet.id}`} className={s.petCard}>
                                <div
                                    className={s.rarityBar}
                                    style={{
                                        background: rarityColor,
                                        boxShadow: `0 0 8px ${rarityColor}`,
                                    }}
                                />
                                <div className={s.visual}>
                                    <div
                                        className={s.rarity}
                                        style={{ color: rarityColor, borderColor: rarityColor }}
                                    >
                                        {getRarityName(pet.rarity)}
                                    </div>
                                    <div className={s.level}>Lv. {pet.level}</div>
                                    {skill ? (
                                        <div className={s.skill} title={skill.description}>
                                            {skill.name}
                                        </div>
                                    ) : null}
                                    <div className={s.avatar}>{getPetAvatar(pet.dna)}</div>
                                </div>

                                <div className={s.info}>
                                    <div className={s.head}>
                                        <div>
                                            <div className={s.name}>{pet.name}</div>
                                            <div className={s.petClass}>
                                                {getPetClass(pet.dna)} · Gen{' '}
                                                {pet.generation ?? getGeneration(pet.dna)}
                                            </div>
                                        </div>
                                        <div className={s.hp}>
                                            <span className={s.hpLabel}>HP</span>
                                            <span className={s.hpValue}>
                                                {getLifePercent(pet)}%
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <div className={s.xpRow}>
                                            <span className={s.xpLabel}>XP</span>
                                            <span className={s.xpValue}>
                                                {xp.xpCurrent}/{xp.xpMax}
                                            </span>
                                        </div>
                                        <div className={s.xpTrack}>
                                            <div
                                                className={s.xpFill}
                                                style={{ width: `${getXpPercent(pet)}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className={s.record}>
                                        <span className={s.wins}>{pet.winCount}W</span>
                                        <span className={s.sep}>/</span>
                                        <span className={s.losses}>{pet.lossCount}L</span>
                                        <span className={s.dot}>·</span>
                                        <span className={s.wr}>{winRatio(pet)}% WR</span>
                                    </div>
                                </div>

                                <div className={s.cardStats}>
                                    {petStatTiles(pet).map((tile) => (
                                        <div className={s.statTile} key={tile.label}>
                                            <div className={s.tileLabel}>{tile.label}</div>
                                            <div className={s.tileValue}>{tile.value}</div>
                                        </div>
                                    ))}
                                </div>

                                {cd.onCooldown && (
                                    <div className={s.status}>
                                        {cd.battleOnCooldown && (
                                            <div className={s.cooldown}>
                                                ⚔️ Battle ready in {cd.battleLabel}
                                            </div>
                                        )}
                                        {cd.breedOnCooldown && (
                                            <div className={s.cooldown}>
                                                🥚 Breed ready in {cd.breedLabel}
                                            </div>
                                        )}
                                        {cd.trainOnCooldown && (
                                            <div className={s.cooldown}>
                                                💪 Train ready in {cd.trainLabel}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className={s.actions}>
                                    <button
                                        type="button"
                                        className={s.battleBtn}
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
                                        className={clsx(s.sendBtn, !cd.battleReady && s.onCooldown)}
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
                        className={s.summonTile}
                        onClick={() => setCreateModalOpen(true)}
                    >
                        <span className={s.summonPlus}>+</span>
                        <span className={s.summonLabel}>Summon a Pet</span>
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
