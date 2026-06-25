import React from 'react';
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
            <div className={`combatant-card combatant-card--${side} is-empty`}>
                <span className="combatant-card__placeholder">{emptyLabel}</span>
            </div>
        );
    }
    const props = getPetProperties(pet);
    const rarityColor = getRarityColor(pet.rarity);
    const hp = getLifePercent(pet);
    return (
        <div className={`combatant-card combatant-card--${side}`}>
            <div className="combatant-card__avatar-wrap">
                <span className="combatant-card__avatar" aria-hidden>
                    {getPetAvatar(pet.dna)}
                </span>
            </div>
            <div className="combatant-card__name">{pet.name}</div>
            <div className="combatant-card__meta">
                Lv.{pet.level} · {getPetClass(pet.dna)} ·{' '}
                <span style={{ color: rarityColor }}>{getRarityName(pet.rarity).toUpperCase()}</span>
            </div>
            {owner ? <div className="combatant-card__owner">{owner}</div> : null}
            <div className="combatant-card__stats">
                {STAT_KEYS.map((s) => (
                    <div className="combatant-stat" key={s.label}>
                        <div className="combatant-stat__label">{s.label}</div>
                        <div className="combatant-stat__val">{props[s.key]}</div>
                    </div>
                ))}
            </div>
            <div className="combatant-card__hp">
                <div className="combatant-card__hp-head">
                    <span>HP</span>
                    <span className="combatant-card__hp-val">{hp}/100</span>
                </div>
                <div className="combatant-card__hp-track">
                    <div
                        className={`combatant-card__hp-fill combatant-card__hp-fill--${side}`}
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
        <div className="interface battle-setup">
            {!isStandaloneView && (
                <>
                    <h4>
                        <Icon as={BattleIcon} tone={Tones.Magenta} />
                        Battle Pets
                    </h4>
                    <p>{subtitle}</p>
                </>
            )}

            <div className="battle-showdown">
                {/* Your fighter */}
                <div className="combatant-col combatant-col--fighter">
                    <div className="combatant-col__label">Your Fighter</div>
                    <div className="combatant-select">
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
                <div className="battle-vs">
                    <div className="battle-vs__mark">VS</div>
                    <div className="battle-vs__divider" />
                    <div className="battle-vs__winrate">
                        <div className="battle-vs__winrate-label">Win Rate</div>
                        <div className="battle-vs__winrate-val">{winRate}</div>
                    </div>
                    <div className="battle-vs__divider" />
                </div>

                {/* On-chain rival */}
                <div className="combatant-col combatant-col--rival">
                    <div className="combatant-col__label">On-Chain Rival</div>
                    <div className="combatant-select">
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
                            className="combatant-select__btn"
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
                            className="combatant-select__btn"
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

            <div className="battle-actions">
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
