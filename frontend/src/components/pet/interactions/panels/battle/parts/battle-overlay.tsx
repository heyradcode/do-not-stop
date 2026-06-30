import React from 'react';
import clsx from 'clsx';
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
import s from '../index.module.css';

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
    <div className={s.log}>
        <div className={s.logTitle}>⚔ Battle Log</div>
        {isLoading || turns.length > 0 ? (
            <BattleDialogue
                turns={turns}
                isLoading={isLoading}
                attackerName={attackerName}
                defenderName={defenderName}
                onComplete={onComplete}
            />
        ) : (
            <p className={s.logWaiting}>{waiting}</p>
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
            <div className={s.scene} role="status" aria-live="polite">
                <div className={s.sceneBanner}>⚔ {preResultTitle} ⚔</div>

                <div className={s.sceneHp}>
                    <div className={s.sceneHpSide}>
                        <div className={s.sceneHpHead}>
                            <span className={clsx(s.sceneHpName, s.isFighter)}>{fighterName}</span>
                            <span className={s.sceneHpVal}>{fighterHp} HP</span>
                        </div>
                        <div className={s.sceneHpTrack}>
                            <div
                                className={clsx(s.sceneHpFill, s.isFighter)}
                                style={{ width: `${fighterHp}%` }}
                            />
                        </div>
                    </div>
                    <div className={s.sceneHpVs}>VS</div>
                    <div className={s.sceneHpSide}>
                        <div className={s.sceneHpHead}>
                            <span className={s.sceneHpVal}>{enemyHp} HP</span>
                            <span className={clsx(s.sceneHpName, s.isEnemy)}>{opponentName}</span>
                        </div>
                        <div className={clsx(s.sceneHpTrack, s.isEnemy)}>
                            <div
                                className={clsx(s.sceneHpFill, s.isEnemy)}
                                style={{ width: `${enemyHp}%` }}
                            />
                        </div>
                    </div>
                </div>

                <div className={s.sceneArena}>
                    <div className={s.sceneFighter}>
                        <span className={clsx(s.sceneHit, s.sceneHitIn)} aria-hidden>
                            ⚡
                        </span>
                        <span className={clsx(s.sceneAvatar, s.isFighter)} aria-hidden>
                            {fighterAvatar}
                        </span>
                        <span className={clsx(s.sceneLabel, s.isFighter)}>{fighterName}</span>
                    </div>
                    <span className={s.sceneClash} aria-hidden>
                        ⚔
                    </span>
                    <div className={s.sceneFighter}>
                        <span className={clsx(s.sceneHit, s.sceneHitOut)} aria-hidden>
                            💥
                        </span>
                        <span className={clsx(s.sceneAvatar, s.isEnemy)} aria-hidden>
                            {enemyAvatar}
                        </span>
                        <span className={clsx(s.sceneLabel, s.isEnemy)}>{opponentName}</span>
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
                    <p className={s.sceneStatus}>{preResultStatus}</p>
                ) : null}
            </div>
        );
    }

    // ── Result scene ───────────────────────────────────────────────────────────
    const bannerClass = clsx(
        s.sceneResult,
        battleOutcome === null && s.isPending,
        isDefeat && s.isDefeat,
    );

    return (
        <div className={clsx(s.scene, s.isResult)} role="status" aria-live="polite">
            <div className={bannerClass}>
                <div className={s.sceneArt} aria-hidden>
                    <BattleResultArt outcome={battleOutcome} />
                </div>
                <div className={s.sceneResultTitle}>
                    {battleOutcome === null ? 'Resolving…' : isVictory ? 'VICTORY!' : 'DEFEATED'}
                </div>
                <div className={s.sceneResultSub}>
                    {battleOutcome === null
                        ? 'Checking battle outcome…'
                        : isVictory
                        ? battleOutcome.leveledUp
                            ? 'Your pet won and leveled up!'
                            : 'Your pet won the battle!'
                        : 'Your pet was defeated. Train harder and try again!'}
                </div>
                {opponent && battleOutcome !== null ? (
                    <div className={s.sceneResultVs}>
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
                <div className={s.sceneActions}>
                    <button
                        type="button"
                        className={s.resultDone}
                        onClick={onDone}
                        disabled={!resultDialogueDone}
                    >
                        🏠 Leave
                    </button>
                    <button
                        type="button"
                        className={clsx(s.resultRematch, isDefeat && s.isDefeat)}
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
