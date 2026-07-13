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
import styles from '../index.module.css';

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
    <div className={styles.log}>
        <div className={styles.logTitle}>⚔ Battle Log</div>
        {isLoading || turns.length > 0 ? (
            <BattleDialogue
                turns={turns}
                isLoading={isLoading}
                attackerName={attackerName}
                defenderName={defenderName}
                onComplete={onComplete}
            />
        ) : (
            <p className={styles.logWaiting}>{waiting}</p>
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
            <div className={styles.scene} role="status" aria-live="polite">
                <div className={styles.sceneBanner}>⚔ {preResultTitle} ⚔</div>

                <div className={styles.sceneHp}>
                    <div className={styles.sceneHpSide}>
                        <div className={styles.sceneHpHead}>
                            <span className={clsx(styles.sceneHpName, styles.isFighter)}>{fighterName}</span>
                            <span className={styles.sceneHpVal}>{fighterHp} HP</span>
                        </div>
                        <div className={styles.sceneHpTrack}>
                            <div
                                className={clsx(styles.sceneHpFill, styles.isFighter)}
                                style={{ width: `${fighterHp}%` }}
                            />
                        </div>
                    </div>
                    <div className={styles.sceneHpVs}>VS</div>
                    <div className={styles.sceneHpSide}>
                        <div className={styles.sceneHpHead}>
                            <span className={styles.sceneHpVal}>{enemyHp} HP</span>
                            <span className={clsx(styles.sceneHpName, styles.isEnemy)}>{opponentName}</span>
                        </div>
                        <div className={clsx(styles.sceneHpTrack, styles.isEnemy)}>
                            <div
                                className={clsx(styles.sceneHpFill, styles.isEnemy)}
                                style={{ width: `${enemyHp}%` }}
                            />
                        </div>
                    </div>
                </div>

                <div className={styles.sceneArena}>
                    <div className={styles.sceneFighter}>
                        <span className={clsx(styles.sceneHit, styles.sceneHitIn)} aria-hidden>
                            ⚡
                        </span>
                        <span className={clsx(styles.sceneAvatar, styles.isFighter)} aria-hidden>
                            {fighterAvatar}
                        </span>
                        <span className={clsx(styles.sceneLabel, styles.isFighter)}>{fighterName}</span>
                    </div>
                    <span className={styles.sceneClash} aria-hidden>
                        ⚔
                    </span>
                    <div className={styles.sceneFighter}>
                        <span className={clsx(styles.sceneHit, styles.sceneHitOut)} aria-hidden>
                            💥
                        </span>
                        <span className={clsx(styles.sceneAvatar, styles.isEnemy)} aria-hidden>
                            {enemyAvatar}
                        </span>
                        <span className={clsx(styles.sceneLabel, styles.isEnemy)}>{opponentName}</span>
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
                    <p className={styles.sceneStatus}>{preResultStatus}</p>
                ) : null}
            </div>
        );
    }

    // ── Result scene ───────────────────────────────────────────────────────────
    const bannerClass = clsx(
        styles.sceneResult,
        battleOutcome === null && styles.isPending,
        isDefeat && styles.isDefeat,
    );

    return (
        <div className={clsx(styles.scene, styles.isResult)} role="status" aria-live="polite">
            <div className={bannerClass}>
                <div className={styles.sceneArt} aria-hidden>
                    <BattleResultArt outcome={battleOutcome} />
                </div>
                <div className={styles.sceneResultTitle}>
                    {battleOutcome === null ? 'Resolving…' : isVictory ? 'VICTORY!' : 'DEFEATED'}
                </div>
                <div className={styles.sceneResultSub}>
                    {battleOutcome === null
                        ? 'Checking battle outcome…'
                        : isVictory
                        ? battleOutcome.leveledUp
                            ? 'Your pet won and leveled up!'
                            : 'Your pet won the battle!'
                        : 'Your pet was defeated. Train harder and try again!'}
                </div>
                {opponent && battleOutcome !== null ? (
                    <div className={styles.sceneResultVs}>
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
                <div className={styles.sceneActions}>
                    <button
                        type="button"
                        className={styles.resultDone}
                        onClick={onDone}
                        disabled={!resultDialogueDone}
                    >
                        🏠 Leave
                    </button>
                    <button
                        type="button"
                        className={clsx(styles.resultRematch, isDefeat && styles.isDefeat)}
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
