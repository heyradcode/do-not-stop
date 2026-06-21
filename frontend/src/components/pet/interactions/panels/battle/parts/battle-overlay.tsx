import React from 'react';
import {
    getLifePercent,
    getPetAvatar,
    type DialogueTurn,
    type OpponentPet,
    type Pet,
} from '@shared/core';
import BattleResultArt from '../battle-result-art';
import BattleDialogue from '../battle-dialogue';
import type { BattleOutcome } from '../types';

export type BattleOverlayProps = {
    open: boolean;
    showResult: boolean;
    battleOutcome: BattleOutcome;
    fighter?: Pet | null;
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

/** Battle Log panel (the chatting) — shared by the fighting and result scenes. */
const BattleLog: React.FC<{
    turns: DialogueTurn[];
    isLoading: boolean;
    attackerName: string;
    defenderName: string;
    onComplete?: () => void;
    waiting: string;
}> = ({ turns, isLoading, attackerName, defenderName, onComplete, waiting }) => (
    <div className="battle-log">
        <div className="battle-log__title">⚔ Battle Log</div>
        {isLoading || turns.length > 0 ? (
            <BattleDialogue
                turns={turns}
                isLoading={isLoading}
                attackerName={attackerName}
                defenderName={defenderName}
                onComplete={onComplete}
            />
        ) : (
            <p className="battle-log__waiting">{waiting}</p>
        )}
    </div>
);

/**
 * Full-scene battle overlay laid out like the redesign mock: an in-scene arena
 * (HP bars + facing-off avatars) with the fighters' conversation shown in a
 * Battle Log panel at the bottom. Stays open continuously across the phases:
 * taunts → battling (pre-result) → result reactions + actions.
 */
const BattleOverlay: React.FC<BattleOverlayProps> = ({
    open,
    showResult,
    battleOutcome,
    fighter,
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

    const fighterHp = fighter ? getLifePercent(fighter) : 100;
    const enemyHp = opponent ? getLifePercent(opponent) : 100;
    const fighterAvatar = fighter ? getPetAvatar(fighter.dna) : '❓';
    const enemyAvatar = opponent ? getPetAvatar(opponent.dna) : '❓';

    // ── Fighting scene (taunts / battle underway) ──────────────────────────────
    if (!showResult) {
        return (
            <div className="battle-scene" role="status" aria-live="polite">
                <div className="battle-scene__banner">⚔ {preResultTitle} ⚔</div>

                <div className="battle-scene__hp">
                    <div className="battle-scene__hp-side">
                        <div className="battle-scene__hp-head">
                            <span className="battle-scene__hp-name is-fighter">{fighterName}</span>
                            <span className="battle-scene__hp-val">{fighterHp} HP</span>
                        </div>
                        <div className="battle-scene__hp-track">
                            <div
                                className="battle-scene__hp-fill is-fighter"
                                style={{ width: `${fighterHp}%` }}
                            />
                        </div>
                    </div>
                    <div className="battle-scene__hp-vs">VS</div>
                    <div className="battle-scene__hp-side">
                        <div className="battle-scene__hp-head">
                            <span className="battle-scene__hp-val">{enemyHp} HP</span>
                            <span className="battle-scene__hp-name is-enemy">{opponentName}</span>
                        </div>
                        <div className="battle-scene__hp-track is-enemy">
                            <div
                                className="battle-scene__hp-fill is-enemy"
                                style={{ width: `${enemyHp}%` }}
                            />
                        </div>
                    </div>
                </div>

                <div className="battle-scene__arena">
                    <div className="battle-scene__fighter">
                        <span className="battle-scene__hit battle-scene__hit--in" aria-hidden>
                            ⚡
                        </span>
                        <span className="battle-scene__avatar is-fighter" aria-hidden>
                            {fighterAvatar}
                        </span>
                        <span className="battle-scene__label is-fighter">{fighterName}</span>
                    </div>
                    <span className="battle-scene__clash" aria-hidden>
                        ⚔
                    </span>
                    <div className="battle-scene__fighter">
                        <span className="battle-scene__hit battle-scene__hit--out" aria-hidden>
                            💥
                        </span>
                        <span className="battle-scene__avatar is-enemy" aria-hidden>
                            {enemyAvatar}
                        </span>
                        <span className="battle-scene__label is-enemy">{opponentName}</span>
                    </div>
                </div>

                <BattleLog
                    turns={tauntsTurns}
                    isLoading={tauntsLoading}
                    attackerName={fighterName}
                    defenderName={opponentName}
                    onComplete={onTauntsComplete}
                    waiting="Waiting for the first taunt…"
                />
                {preResultStatus ? (
                    <p className="battle-scene__status">{preResultStatus}</p>
                ) : null}
            </div>
        );
    }

    // ── Result scene ───────────────────────────────────────────────────────────
    const bannerClass = [
        'battle-scene__result',
        battleOutcome === null ? 'is-pending' : isVictory ? 'is-victory' : 'is-defeat',
    ].join(' ');

    return (
        <div className="battle-scene is-result" role="status" aria-live="polite">
            <div className={bannerClass}>
                <div className="battle-scene__art" aria-hidden>
                    <BattleResultArt outcome={battleOutcome} />
                </div>
                <div className="battle-scene__result-title">
                    {battleOutcome === null ? 'Resolving…' : isVictory ? 'VICTORY!' : 'DEFEATED'}
                </div>
                <div className="battle-scene__result-sub">
                    {battleOutcome === null
                        ? 'Checking battle outcome…'
                        : isVictory
                        ? battleOutcome.leveledUp
                            ? 'Your pet won and leveled up!'
                            : 'Your pet won the battle!'
                        : 'Your pet was defeated. Train harder and try again!'}
                </div>
                {opponent && battleOutcome !== null ? (
                    <div className="battle-scene__result-vs">
                        {isVictory
                            ? `vs ${opponent.name} (Lv.${opponent.level})`
                            : `Lost to ${opponent.name} (Lv.${opponent.level})`}
                    </div>
                ) : null}
            </div>

            {battleOutcome !== null ? (
                <BattleLog
                    turns={resultTurns}
                    isLoading={dialogueLoading}
                    attackerName={resultAttackerName}
                    defenderName={resultDefenderName}
                    onComplete={onResultComplete}
                    waiting="The dust settles…"
                />
            ) : null}

            {battleOutcome !== null && (
                <div className="battle-scene__actions">
                    <button
                        type="button"
                        className="battle-result-done"
                        onClick={onDone}
                        disabled={!resultDialogueDone}
                    >
                        🏠 Leave
                    </button>
                    <button
                        type="button"
                        className={`battle-result-rematch${isDefeat ? ' is-defeat' : ''}`}
                        onClick={onRematch}
                        disabled={battlePending || rematchPending || !resultDialogueDone}
                    >
                        {rematchPending ? 'Preparing…' : '⚔ Rematch'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default BattleOverlay;
