import React from 'react';
import clsx from 'clsx';
import {
    getLifePercent,
    getPetAvatar,
    getPetClass,
    getPetProperties,
    getRarityColor,
    getRarityName,
    type OpponentPet,
    type Pet,
    type ReadyPet,
    type WinEstimateResult,
} from '@shared/core';
import { Tones } from '@constants/tones';
import { AuthActionButton } from '@components/common';
import Icon, { BattleIcon } from '@components/ui/icon';
import { opponentKey, shortAddress } from '../battle-utils';
import styles from '../index.module.css';

export type BattleSetupProps = {
    isStandaloneView: boolean;
    subtitle: string;
    selectedFighter: Pet | null;
    opponent?: OpponentPet;
    randomMatchDisabled: boolean;
    onRandomMatch: () => void;
    readyPets: ReadyPet[];
    selectedPet1: string;
    onSelectFighter: (petId: string) => void;
    sortedOpponents: OpponentPet[];
    selectedOpponentKey: string;
    onSelectOpponent: (key: string) => void;
    opponentsLoading: boolean;
    onRefreshOpponents: () => void;
    onBattle: () => void;
    battleDisabled: boolean;
    battleButtonLabel: string;
    onCancel: () => void;
    winEstimate: WinEstimateResult;
};

/** Four real DNA-backed stats. AGI has no data backing, so we keep the app's
 *  STR / INT / DEF / VIT set rather than the mock's STR/AGI/INT/DEF. */
const STAT_KEYS = [
    { label: 'STR', key: 'attack' },
    { label: 'INT', key: 'intelligence' },
    { label: 'DEF', key: 'defense' },
    { label: 'VIT', key: 'life' },
] as const;

/** One combatant's full stat card (fighter or rival), or an empty prompt. */
const CombatantCard: React.FC<{
    pet: Pet | OpponentPet | null;
    side: 'fighter' | 'rival';
    emptyLabel: string;
    owner?: string;
}> = ({ pet, side, emptyLabel, owner }) => {
    if (!pet) {
        return (
            <div
                className={clsx(
                    styles.combatantCard,
                    side === 'rival' && styles.combatantCardRival,
                    styles.isEmpty,
                )}
            >
                <span className={styles.combatantCardPlaceholder}>{emptyLabel}</span>
            </div>
        );
    }
    const props = getPetProperties(pet);
    const rarityColor = getRarityColor(pet.rarity);
    const hp = getLifePercent(pet);
    return (
        <div className={clsx(styles.combatantCard, side === 'rival' && styles.combatantCardRival)}>
            <div className={styles.combatantCardAvatarWrap}>
                <span className={styles.combatantCardAvatar} aria-hidden>
                    {getPetAvatar(pet.dna)}
                </span>
            </div>
            <div className={styles.combatantCardName}>{pet.name}</div>
            <div className={styles.combatantCardMeta}>
                Lv.{pet.level} · {getPetClass(pet.dna)} ·{' '}
                <span style={{ color: rarityColor }}>{getRarityName(pet.rarity).toUpperCase()}</span>
            </div>
            {owner ? <div className={styles.combatantCardOwner}>{owner}</div> : null}
            <div className={styles.combatantCardStats}>
                {STAT_KEYS.map((stat) => (
                    <div className={styles.combatantStat} key={stat.label}>
                        <div className={styles.combatantStatLabel}>{stat.label}</div>
                        <div className={styles.combatantStatVal}>{props[stat.key]}</div>
                    </div>
                ))}
            </div>
            <div className={styles.combatantCardHp}>
                <div className={styles.combatantCardHpHead}>
                    <span>HP</span>
                    <span className={styles.combatantCardHpVal}>{hp}/100</span>
                </div>
                <div className={styles.combatantCardHpTrack}>
                    <div
                        className={clsx(
                            styles.combatantCardHpFill,
                            side === 'fighter'
                                ? styles.combatantCardHpFillFighter
                                : styles.combatantCardHpFillRival,
                        )}
                        style={{ width: `${hp}%` }}
                    />
                </div>
            </div>
        </div>
    );
};

/** The battle setup screen: a fighter-vs-rival showdown with selection controls. */
const BattleSetup: React.FC<BattleSetupProps> = ({
    isStandaloneView,
    subtitle,
    selectedFighter,
    opponent,
    randomMatchDisabled,
    onRandomMatch,
    readyPets,
    selectedPet1,
    onSelectFighter,
    sortedOpponents,
    selectedOpponentKey,
    onSelectOpponent,
    opponentsLoading,
    onRefreshOpponents,
    onBattle,
    battleDisabled,
    battleButtonLabel,
    onCancel,
    winEstimate,
}) => {
    const winRate = winEstimate.isLoading
        ? '…'
        : winEstimate.winProbability != null
        ? `${Math.round(winEstimate.winProbability * 100)}%`
        : '—';

    const opponentEmpty = opponentsLoading
        ? 'Finding challengers…'
        : sortedOpponents.length === 0
        ? 'No opponents available'
        : 'Select an opponent';

    return (
        <div className={clsx('interface', styles.battleSetup)}>
            {!isStandaloneView && (
                <>
                    <h4>
                        <Icon as={BattleIcon} tone={Tones.Magenta} />
                        Battle Pets
                    </h4>
                    <p>{subtitle}</p>
                </>
            )}

            <div className={styles.showdown}>
                {/* Your fighter */}
                <div className={clsx(styles.combatantCol, styles.combatantColFighter)}>
                    <div className={styles.combatantColLabel}>Your Fighter</div>
                    <div className={styles.combatantSelect}>
                        <select
                            aria-label="Choose your fighter"
                            value={selectedPet1}
                            onChange={(e) => onSelectFighter(e.target.value)}
                        >
                            <option value="">
                                {readyPets.length === 0 ? 'No ready fighters' : 'Choose your fighter…'}
                            </option>
                            {readyPets.map(({ id, pet }) => (
                                <option key={id} value={id}>
                                    {pet.name} (Lv {pet.level})
                                </option>
                            ))}
                        </select>
                    </div>
                    <CombatantCard
                        pet={selectedFighter}
                        side="fighter"
                        emptyLabel={readyPets.length === 0 ? 'No ready fighters' : 'Choose your fighter'}
                    />
                </div>

                {/* VS + win rate */}
                <div className={styles.vs}>
                    <div className={styles.vsMark}>VS</div>
                    <div className={styles.vsDivider} />
                    <div className={styles.vsWinrate}>
                        <div className={styles.vsWinrateLabel}>Win Rate</div>
                        <div className={styles.vsWinrateVal}>{winRate}</div>
                    </div>
                    <div className={styles.vsDivider} />
                </div>

                {/* On-chain rival */}
                <div className={clsx(styles.combatantCol, styles.combatantColRival)}>
                    <div className={styles.combatantColLabel}>On-Chain Rival</div>
                    <div className={styles.combatantSelect}>
                        <select
                            aria-label="Select an opponent"
                            value={selectedOpponentKey}
                            onChange={(e) => onSelectOpponent(e.target.value)}
                            disabled={sortedOpponents.length === 0}
                        >
                            <option value="">{opponentEmpty}</option>
                            {sortedOpponents.map((o) => {
                                const key = opponentKey(o.owner, o.id);
                                return (
                                    <option key={key} value={key}>
                                        {o.name} (Lv {o.level})
                                    </option>
                                );
                            })}
                        </select>
                        <button
                            type="button"
                            className={styles.combatantSelectBtn}
                            onClick={onRandomMatch}
                            disabled={randomMatchDisabled}
                            title={
                                selectedFighter
                                    ? 'Pick a random opponent near your fighter level'
                                    : 'Select your fighter first'
                            }
                        >
                            🎲 Random
                        </button>
                        <button
                            type="button"
                            className={styles.combatantSelectBtn}
                            onClick={onRefreshOpponents}
                            disabled={opponentsLoading}
                        >
                            {opponentsLoading ? '…' : 'Refresh'}
                        </button>
                    </div>
                    <CombatantCard
                        pet={opponent ?? null}
                        side="rival"
                        emptyLabel={opponentEmpty}
                        owner={opponent ? shortAddress(opponent.owner) : undefined}
                    />
                </div>
            </div>

            <div className={styles.actions}>
                <AuthActionButton tone="magenta" onClick={onBattle} disabled={battleDisabled}>
                    ⚔ {battleButtonLabel}
                </AuthActionButton>
                <button type="button" onClick={onCancel} className="cancel-button">
                    Cancel
                </button>
            </div>
        </div>
    );
};

export default BattleSetup;
