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
import PendingBattleNotice from './pending-battle-notice';
import OpenToChallengesToggle from './open-to-challenges-toggle';
import { opponentKey, shortAddress } from '../battle-utils';
import s from '../index.module.css';

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
                    s.combatantCard,
                    side === 'rival' && s.combatantCardRival,
                    s.isEmpty,
                )}
            >
                <span className={s.combatantCardPlaceholder}>{emptyLabel}</span>
            </div>
        );
    }
    const props = getPetProperties(pet);
    const rarityColor = getRarityColor(pet.rarity);
    const hp = getLifePercent(pet);
    return (
        <div className={clsx(s.combatantCard, side === 'rival' && s.combatantCardRival)}>
            <div className={s.combatantCardAvatarWrap}>
                <span className={s.combatantCardAvatar} aria-hidden>
                    {getPetAvatar(pet.dna)}
                </span>
            </div>
            <div className={s.combatantCardName}>{pet.name}</div>
            <div className={s.combatantCardMeta}>
                Lv.{pet.level} · {getPetClass(pet.dna)} ·{' '}
                <span style={{ color: rarityColor }}>{getRarityName(pet.rarity).toUpperCase()}</span>
            </div>
            {owner ? <div className={s.combatantCardOwner}>{owner}</div> : null}
            <div className={s.combatantCardStats}>
                {STAT_KEYS.map((stat) => (
                    <div className={s.combatantStat} key={stat.label}>
                        <div className={s.combatantStatLabel}>{stat.label}</div>
                        <div className={s.combatantStatVal}>{props[stat.key]}</div>
                    </div>
                ))}
            </div>
            <div className={s.combatantCardHp}>
                <div className={s.combatantCardHpHead}>
                    <span>HP</span>
                    <span className={s.combatantCardHpVal}>{hp}/100</span>
                </div>
                <div className={s.combatantCardHpTrack}>
                    <div
                        className={clsx(
                            s.combatantCardHpFill,
                            side === 'fighter'
                                ? s.combatantCardHpFillFighter
                                : s.combatantCardHpFillRival,
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
        <div className={clsx('interface', s.battleSetup)}>
            {!isStandaloneView && (
                <>
                    <h4>
                        <Icon as={BattleIcon} tone={Tones.Magenta} />
                        Battle Pets
                    </h4>
                    <p>{subtitle}</p>
                </>
            )}

            <div className={s.showdown}>
                {/* Your fighter */}
                <div className={clsx(s.combatantCol, s.combatantColFighter)}>
                    <div className={s.combatantColLabel}>Your Fighter</div>
                    <div className={s.combatantSelect}>
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
                <div className={s.vs}>
                    <div className={s.vsMark}>VS</div>
                    <div className={s.vsDivider} />
                    <div className={s.vsWinrate}>
                        <div className={s.vsWinrateLabel}>Win Rate</div>
                        <div className={s.vsWinrateVal}>{winRate}</div>
                    </div>
                    <div className={s.vsDivider} />
                </div>

                {/* On-chain rival */}
                <div className={clsx(s.combatantCol, s.combatantColRival)}>
                    <div className={s.combatantColLabel}>On-Chain Rival</div>
                    <div className={s.combatantSelect}>
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
                            className={s.combatantSelectBtn}
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
                            className={s.combatantSelectBtn}
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

            <PendingBattleNotice
                petId={selectedPet1}
                label={selectedFighter?.name}
                checkSolana
            />
            {opponent ? (
                <PendingBattleNotice petId={opponent.id} label={opponent.name} />
            ) : null}
            <OpenToChallengesToggle
                petId={selectedPet1}
                currentValue={selectedFighter?.openToChallenges}
            />

            <div className={s.actions}>
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
