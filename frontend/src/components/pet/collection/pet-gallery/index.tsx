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
import styles from './index.module.css';

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
            <div className={clsx(styles.idle, styles.idleMessage)}>
                <div className={styles.prompt}>
                    <Icon as={PawIcon} tone={Tones.Cyan} glow="strong" noGap />
                    <h2>Your Pet Collection</h2>
                    <p>Connect your wallet to view your pets.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.idle}>
            {/* Stat strip — Pets & Wins are real; Global rank is a placeholder */}
            <div className={styles.stats}>
                <div className={clsx(styles.stat, styles.cyan)}>
                    <span className={styles.statIcon} aria-hidden>
                        🐾
                    </span>
                    <div className={styles.statBody}>
                        <div className={styles.statValue}>{pets.length}</div>
                        <div className={styles.statLabel}>Pets</div>
                    </div>
                </div>
                <div className={clsx(styles.stat, styles.violet)}>
                    <span className={styles.statIcon} aria-hidden>
                        ⚔
                    </span>
                    <div className={styles.statBody}>
                        <div className={styles.statValue}>{totalWins}</div>
                        <div className={styles.statLabel}>Wins</div>
                    </div>
                </div>
                <div className={clsx(styles.stat, styles.gold)}>
                    <span className={styles.statIcon} aria-hidden>
                        🏆
                    </span>
                    <div className={styles.statBody}>
                        <div className={styles.statValue}>#3</div>
                        <div className={styles.statLabel}>Global Rank</div>
                    </div>
                </div>
            </div>

            {/* Leaderboard — full-width row below the stats (placeholder ranking data) */}
            <div className={styles.leaderboard}>
                <div className={styles.leaderboardTitle}>🏆 Leaderboard</div>
                <ul className={styles.leaderboardList}>
                    {LEADERBOARD_PLACEHOLDER.map((row) => (
                        <li key={row.rank} className={clsx(styles.lbRow, row.me && styles.isMe)}>
                            <span className={styles.lbRank}>#{row.rank}</span>
                            <span className={styles.lbName}>{row.name}</span>
                            <span className={styles.lbTier}>{row.tier}</span>
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
                <div className={styles.petGrid}>
                    {pets.map((pet) => {
                        const cd = statusFor(pet);
                        const rarityColor = getRarityColor(pet.rarity);
                        const xp = getXpNumbers(pet);
                        const skill = getPetSkill(pet.speciesId);
                        return (
                            <div key={`${pet.chain}-${pet.id}`} className={styles.petCard}>
                                <div
                                    className={styles.rarityBar}
                                    style={{
                                        background: rarityColor,
                                        boxShadow: `0 0 8px ${rarityColor}`,
                                    }}
                                />
                                <div className={styles.visual}>
                                    <div
                                        className={styles.rarity}
                                        style={{ color: rarityColor, borderColor: rarityColor }}
                                    >
                                        {getRarityName(pet.rarity)}
                                    </div>
                                    <div className={styles.level}>Lv. {pet.level}</div>
                                    {skill ? (
                                        <div className={styles.skill} title={skill.description}>
                                            {skill.name}
                                        </div>
                                    ) : null}
                                    <div className={styles.avatar}>{getPetAvatar(pet.dna)}</div>
                                </div>

                                <div className={styles.info}>
                                    <div className={styles.head}>
                                        <div>
                                            <div className={styles.name}>{pet.name}</div>
                                            <div className={styles.petClass}>
                                                {getPetClass(pet.dna)} · Gen{' '}
                                                {pet.generation ?? getGeneration(pet.dna)}
                                            </div>
                                        </div>
                                        <div className={styles.hp}>
                                            <span className={styles.hpLabel}>HP</span>
                                            <span className={styles.hpValue}>
                                                {getLifePercent(pet)}%
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <div className={styles.xpRow}>
                                            <span className={styles.xpLabel}>XP</span>
                                            <span className={styles.xpValue}>
                                                {xp.xpCurrent}/{xp.xpMax}
                                            </span>
                                        </div>
                                        <div className={styles.xpTrack}>
                                            <div
                                                className={styles.xpFill}
                                                style={{ width: `${getXpPercent(pet)}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className={styles.record}>
                                        <span className={styles.wins}>{pet.winCount}W</span>
                                        <span className={styles.sep}>/</span>
                                        <span className={styles.losses}>{pet.lossCount}L</span>
                                        <span className={styles.dot}>·</span>
                                        <span className={styles.wr}>{winRatio(pet)}% WR</span>
                                    </div>
                                </div>

                                <div className={styles.cardStats}>
                                    {petStatTiles(pet).map((tile) => (
                                        <div className={styles.statTile} key={tile.label}>
                                            <div className={styles.tileLabel}>{tile.label}</div>
                                            <div className={styles.tileValue}>{tile.value}</div>
                                        </div>
                                    ))}
                                </div>

                                {cd.onCooldown && (
                                    <div className={styles.status}>
                                        {cd.battleOnCooldown && (
                                            <div className={styles.cooldown}>
                                                ⚔️ Battle ready in {cd.battleLabel}
                                            </div>
                                        )}
                                        {cd.breedOnCooldown && (
                                            <div className={styles.cooldown}>
                                                🥚 Breed ready in {cd.breedLabel}
                                            </div>
                                        )}
                                        {cd.trainOnCooldown && (
                                            <div className={styles.cooldown}>
                                                💪 Train ready in {cd.trainLabel}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className={styles.actions}>
                                    <button
                                        type="button"
                                        className={styles.battleBtn}
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
                                        className={clsx(styles.sendBtn, !cd.battleReady && styles.onCooldown)}
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
                        className={styles.summonTile}
                        onClick={() => setCreateModalOpen(true)}
                    >
                        <span className={styles.summonPlus}>+</span>
                        <span className={styles.summonLabel}>Summon a Pet</span>
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
