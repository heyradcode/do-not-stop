import React from 'react';
import clsx from 'clsx';
import { Tones } from '@constants/tones';
import Icon, { CloseIcon, PawIcon } from '@components/ui/icon';
import NeonButton from '@components/ui/neon-button';
import CreatePetModal from '@components/pet/creation/create-pet-modal';
import SendPetModal from '@components/pet/transfer/send-pet-modal';
import { usePetGallery } from '@hooks/pet-gallery/usePetGallery';
import PetCard from './parts/pet-card';
import styles from './index.module.css';

/** Placeholder leaderboard rows — pending real ranking data (plan §8 Q3). */
const LEADERBOARD_PLACEHOLDER = [
    { rank: 1, name: 'CryptoKing', wins: 842, tier: 'Diamond', me: false },
    { rank: 2, name: 'DragonMstr', wins: 721, tier: 'Diamond', me: false },
    { rank: 3, name: 'You', wins: 649, tier: 'Gold', me: true },
    { rank: 4, name: 'PetLegend', wins: 511, tier: 'Gold', me: false },
    { rank: 5, name: 'BreedKing', wins: 402, tier: 'Platinum', me: false },
] as const;

const PetGallery: React.FC = () => {
    const {
        isConnected,
        pets,
        isLoading,
        error,
        totalWins,
        statusFor,
        onRefetch,
        onBattle,
        onSendClick,
        sendModalOpen,
        sendSelection,
        onCloseSendModal,
        createModalOpen,
        onOpenCreateModal,
        onCloseCreateModal,
    } = usePetGallery();

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
                    <NeonButton tone="magenta" size="sm" onClick={() => onRefetch()}>
                        Try Again
                    </NeonButton>
                </div>
            )}

            {!isLoading && !error && (
                <div className={styles.petGrid}>
                    {pets.map((pet) => (
                        <PetCard
                            key={`${pet.chain}-${pet.id}`}
                            pet={pet}
                            cooldown={statusFor(pet)}
                            onBattle={() => onBattle(pet)}
                            onSendClick={() => onSendClick(pet)}
                        />
                    ))}

                    <button type="button" className={styles.summonTile} onClick={onOpenCreateModal}>
                        <span className={styles.summonPlus}>+</span>
                        <span className={styles.summonLabel}>Summon a Pet</span>
                    </button>
                </div>
            )}

            {sendModalOpen && sendSelection && (
                <SendPetModal
                    isOpen={sendModalOpen}
                    onClose={onCloseSendModal}
                    pet={sendSelection.pet}
                    petId={sendSelection.petId}
                />
            )}

            <CreatePetModal isOpen={createModalOpen} onClose={onCloseCreateModal} />
        </div>
    );
};

export default PetGallery;
