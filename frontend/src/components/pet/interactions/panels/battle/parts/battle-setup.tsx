import React from 'react';
import { type OpponentPet, type Pet, type ReadyPet, type WinEstimateResult } from '@shared/core';
import { Tones } from '@constants/tones';
import { AuthActionButton } from '@components/common';
import Icon, { BattleIcon } from '@components/ui/icon';
import ArenaSlot from './arena-slot';
import FighterPickerCard from './fighter-picker-card';
import OpponentPickerCard from './opponent-picker-card';
import PendingBattleNotice from './pending-battle-notice';
import OpenToChallengesToggle from './open-to-challenges-toggle';
import { opponentKey, shortAddress } from '../battle-utils';

export type BattleSetupProps = {
    isStandaloneView: boolean;
    subtitle: string;
    arenaClassName: string;
    isArenaFighting: boolean;
    isArenaReady: boolean;
    showResult: boolean;
    selectedFighter: Pet | null;
    opponent?: OpponentPet;
    opponentSlotFlash: boolean;
    randomMatchDisabled: boolean;
    onRandomMatch: () => void;
    readyPets: ReadyPet[];
    selectedPet1: string;
    onSelectFighter: (petId: string) => void;
    sortedOpponents: OpponentPet[];
    fighterLevel: number | null;
    selectedOpponentKey: string;
    onSelectOpponent: (key: string) => void;
    selectedOpponentCardRef: React.Ref<HTMLButtonElement>;
    opponentsLoading: boolean;
    onRefreshOpponents: () => void;
    onBattle: () => void;
    battleDisabled: boolean;
    battleButtonLabel: string;
    onCancel: () => void;
    winEstimate: WinEstimateResult;
};

/** The battle setup screen: arena, fighter/opponent pickers, and action controls. */
const BattleSetup: React.FC<BattleSetupProps> = ({
    isStandaloneView,
    subtitle,
    arenaClassName,
    isArenaFighting,
    isArenaReady,
    showResult,
    selectedFighter,
    opponent,
    opponentSlotFlash,
    randomMatchDisabled,
    onRandomMatch,
    readyPets,
    selectedPet1,
    onSelectFighter,
    sortedOpponents,
    fighterLevel,
    selectedOpponentKey,
    onSelectOpponent,
    selectedOpponentCardRef,
    opponentsLoading,
    onRefreshOpponents,
    onBattle,
    battleDisabled,
    battleButtonLabel,
    onCancel,
    winEstimate,
}) => (
    <div className="interface battle-setup">
        {!isStandaloneView && (
            <>
                <h4><Icon as={BattleIcon} tone={Tones.Magenta} />Battle Pets</h4>
                <p>{subtitle}</p>
            </>
        )}

        <div className={arenaClassName}>
            <div className="header">
                <span><Icon as={BattleIcon} tone={Tones.Magenta} />Battle Arena</span>
                <div className="arena-actions">
                    <button
                        type="button"
                        className="section-action section-action-primary"
                        onClick={onRandomMatch}
                        disabled={randomMatchDisabled}
                        title={
                            selectedFighter
                                ? 'Pick a random opponent near your fighter level'
                                : 'Select your fighter first'
                        }
                    >
                        Random match
                    </button>
                    <span className="arena-badge">
                        {isArenaFighting ? 'Fighting' : showResult ? 'Complete' : isArenaReady ? 'Ready' : 'Setup'}
                    </span>
                </div>
            </div>
            <div className="hub-divider" />
            <div className="content">
                <ArenaSlot pet={selectedFighter} placeholder="Choose fighter" side="fighter" />
                <div className="center">
                    <div className="icon">
                        <Icon as={BattleIcon} tone={Tones.Magenta} glow="strong" className="no-gap" size={18} />
                    </div>
                    <div className="vs">VS</div>
                </div>
                <ArenaSlot
                    pet={opponent}
                    placeholder="Select opponent"
                    ownerLabel={opponent ? shortAddress(opponent.owner) : undefined}
                    side="opponent"
                    flash={opponentSlotFlash}
                />
            </div>
        </div>

        <PendingBattleNotice petId={selectedPet1} label={selectedFighter?.name} checkSolana />
        {opponent ? <PendingBattleNotice petId={opponent.id} label={opponent.name} /> : null}
        <OpenToChallengesToggle petId={selectedPet1} currentValue={selectedFighter?.openToChallenges} />

        <section className="battle-picker-section" aria-label="Your fighters">
            <div className="section-head">
                <h5 className="section-title">Your fighters</h5>
            </div>
            {readyPets.length === 0 ? (
                <div className="battle-picker-empty">
                    No ready pets. Wait for cooldowns to finish before battling.
                </div>
            ) : (
                <div className="battle-picker-strip">
                    {readyPets.map(({ id, pet }) => (
                        <FighterPickerCard
                            key={id}
                            pet={pet}
                            petId={id}
                            selected={selectedPet1 === id}
                            onSelect={onSelectFighter}
                        />
                    ))}
                </div>
            )}
        </section>

        <section className="battle-picker-section" aria-label="Opponents">
            <div className="section-head">
                <h5 className="section-title">
                    Opponents
                    {fighterLevel != null ? (
                        <span className="section-hint"> · sorted by level match</span>
                    ) : null}
                </h5>
                <button
                    type="button"
                    className="section-action"
                    onClick={onRefreshOpponents}
                    disabled={opponentsLoading}
                >
                    {opponentsLoading ? 'Loading…' : 'Refresh'}
                </button>
            </div>
            {opponentsLoading && sortedOpponents.length === 0 ? (
                <div className="battle-picker-empty">Finding challengers in the arena…</div>
            ) : sortedOpponents.length === 0 ? (
                <div className="battle-picker-empty">
                    No opponents available right now. Check back after more players join the roster.
                </div>
            ) : (
                <div className="battle-opponent-grid">
                    {sortedOpponents.map((o) => {
                        const key = opponentKey(o.owner, o.id);
                        return (
                            <OpponentPickerCard
                                key={key}
                                opponent={o}
                                fighterLevel={fighterLevel}
                                selected={selectedOpponentKey === key}
                                onSelect={onSelectOpponent}
                                cardRef={selectedOpponentKey === key ? selectedOpponentCardRef : undefined}
                            />
                        );
                    })}
                </div>
            )}
        </section>

        {isArenaReady && (
            <div className="win-estimate">
                {winEstimate.isLoading ? (
                    <span className="win-estimate-loading">Calculating odds…</span>
                ) : winEstimate.winProbability != null ? (
                    <>
                        <span className="win-estimate-label">Win odds</span>
                        <span className={`win-estimate-value${winEstimate.winProbability >= 0.5 ? ' favorable' : ' unfavorable'}`}>
                            {Math.round(winEstimate.winProbability * 100)}%
                        </span>
                        {winEstimate.samples != null && (
                            <span className="win-estimate-samples">({winEstimate.samples.toLocaleString()} sim)</span>
                        )}
                    </>
                ) : (
                    <span className="win-estimate-unavailable">Odds unavailable</span>
                )}
            </div>
        )}

        <div className="action-controls">
            <AuthActionButton onClick={onBattle} disabled={battleDisabled}>
                {battleButtonLabel}
            </AuthActionButton>
            <button type="button" onClick={onCancel} className="cancel-button">
                Cancel
            </button>
        </div>
    </div>
);

export default BattleSetup;
