import React from 'react';
import type { DialogueTurn, OpponentPet } from '@shared/core';
import BattleResultArt from '../battle-result-art';
import BattleDialogue from '../battle-dialogue';
import type { BattleOutcome } from '../types';

export type BattleOverlayProps = {
    open: boolean;
    showResult: boolean;
    battleOutcome: BattleOutcome;
    opponent?: OpponentPet;
    // Result phase
    resultTurns: DialogueTurn[];
    dialogueLoading: boolean;
    resultAttackerName: string;
    resultDefenderName: string;
    onResultComplete: () => void;
    resultDialogueDone: boolean;
    onRematch: () => void;
    onDone: () => void;
    rematchPending: boolean;
    battlePending: boolean;
    // Pre-result phase
    preResultTitle: string;
    preResultStatus: string | null;
    tauntsLoading: boolean;
    tauntsTurns: DialogueTurn[];
    /** Fires once the pre-fight taunts finish typing (gates the wallet prompt). */
    onTauntsComplete: () => void;
    fighterName: string;
    opponentName: string;
};

/**
 * Full-screen battle overlay. Stays open continuously across the phases:
 * taunts → battling (pre-result) → result reactions + actions.
 */
const BattleOverlay: React.FC<BattleOverlayProps> = ({
    open,
    showResult,
    battleOutcome,
    opponent,
    resultTurns,
    dialogueLoading,
    resultAttackerName,
    resultDefenderName,
    onResultComplete,
    resultDialogueDone,
    onRematch,
    onDone,
    rematchPending,
    battlePending,
    preResultTitle,
    preResultStatus,
    tauntsLoading,
    tauntsTurns,
    onTauntsComplete,
    fighterName,
    opponentName,
}) => {
    if (!open) return null;

    const isVictory = battleOutcome?.result === 'victory';
    const isDefeat = battleOutcome?.result === 'defeat';
    const resultCardClass = [
        'battle-result-card',
        battleOutcome === null ? 'is-pending' : isVictory ? '' : 'is-defeat',
    ].filter(Boolean).join(' ');

    return (
        <div className="battle-result-overlay" role="status" aria-live="polite">
            <div className={resultCardClass}>
                {showResult ? (
                    <>
                        <div className="battle-result-art" aria-hidden>
                            <BattleResultArt outcome={battleOutcome} />
                        </div>
                        <p className="battle-result-title">
                            {battleOutcome === null ? 'Resolving…' : isVictory ? 'Victory!' : 'Defeated'}
                        </p>
                        <p className="battle-result-message">
                            {battleOutcome === null
                                ? 'Checking battle outcome…'
                                : isVictory
                                    ? battleOutcome.leveledUp
                                        ? 'Your pet won and leveled up!'
                                        : 'Your pet won the battle!'
                                    : 'Your pet was defeated. Train harder and try again!'}
                        </p>
                        {opponent && battleOutcome !== null ? (
                            <p className="battle-result-opponent">
                                {isVictory
                                    ? `vs ${opponent.name} (Lv.${opponent.level})`
                                    : `Lost to ${opponent.name} (Lv.${opponent.level})`}
                            </p>
                        ) : null}
                        {battleOutcome !== null && (dialogueLoading || resultTurns.length > 0) ? (
                            <BattleDialogue
                                turns={resultTurns}
                                isLoading={dialogueLoading}
                                attackerName={resultAttackerName}
                                defenderName={resultDefenderName}
                                onComplete={onResultComplete}
                            />
                        ) : null}
                        {battleOutcome !== null && (
                            <div className="battle-result-actions">
                                <button
                                    type="button"
                                    className={`battle-result-rematch${isDefeat ? ' is-defeat' : ''}`}
                                    onClick={onRematch}
                                    disabled={battlePending || rematchPending || !resultDialogueDone}
                                >
                                    {rematchPending ? 'Preparing…' : 'Rematch'}
                                </button>
                                <button
                                    type="button"
                                    className="battle-result-done"
                                    onClick={onDone}
                                    disabled={!resultDialogueDone}
                                >
                                    Leave
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <p className="battle-result-title">{preResultTitle}</p>
                        {tauntsLoading || tauntsTurns.length > 0 ? (
                            <BattleDialogue
                                turns={tauntsTurns}
                                isLoading={tauntsLoading}
                                attackerName={fighterName}
                                defenderName={opponentName}
                                onComplete={onTauntsComplete}
                            />
                        ) : null}
                        {preResultStatus ? <p className="battle-result-message">{preResultStatus}</p> : null}
                    </>
                )}
            </div>
        </div>
    );
};

export default BattleOverlay;
