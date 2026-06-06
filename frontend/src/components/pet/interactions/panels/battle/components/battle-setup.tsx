import React from 'react';
import { type OpponentPet, type Pet, type ReadyPet } from '@shared/core';
import { Tones } from '@constants/tones';
import { AuthActionButton } from '@components/common';
import Icon, { BattleIcon } from '@components/ui/icon';
import ArenaSlot from './arena-slot';
import FighterPickerCard from './fighter-picker-card';
import OpponentPickerCard from './opponent-picker-card';
import { opponentKey, shortAddress } from '../battle-utils';

type BattleSetupProps = {
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
