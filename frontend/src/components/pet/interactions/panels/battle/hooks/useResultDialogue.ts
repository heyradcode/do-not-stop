import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    useBattleDialogue,
    type DialogueTurn,
    type OpponentPet,
    type Pet,
    type PetChain,
} from '@shared/core';
import type { BattleOutcome } from '../types';
import { toDialoguePet, type BattlePersonas } from '../battle-utils';

interface UseResultDialogueArgs {
    activeChainKind: PetChain | null;
    /** Stable per-battle key (tx hash); null until the battle is confirming. */
    settledBattleId: string | null;
    selectedFighter: Pet | null;
    opponent?: OpponentPet;
    /** Personas captured at battle start, used once the fighter goes on cooldown. */
    personasRef: React.MutableRefObject<BattlePersonas | null>;
    battleOutcome: BattleOutcome;
    showResult: boolean;
}

export interface UseResultDialogue {
    /** AI result-phase reactions to play on the result screen. */
    resultTurns: DialogueTurn[];
    dialogueLoading: boolean;
    /** True once the result dialogue has played (or there was nothing to play). */
    resultDialogueDone: boolean;
    /** Mark the dialogue finished (called from the typewriter's onComplete). */
    markResultDialogueDone: () => void;
    /** Re-gate the result actions for a fresh battle/rematch. */
    resetResultDialogue: () => void;
    attackerName: string;
    defenderName: string;
}

/**
 * Fetch the settled battle's AI dialogue and gate the result actions on it.
 * Falls back to the personas captured at battle start because the fighter drops
 * out of the ready list (→ null) once it goes on cooldown, which would otherwise
 * disable the query and the pre-generated result would never be fetched.
 */
export function useResultDialogue({
    activeChainKind,
    settledBattleId,
    selectedFighter,
    opponent,
    personasRef,
    battleOutcome,
    showResult,
}: UseResultDialogueArgs): UseResultDialogue {
    const [resultDialogueDone, setResultDialogueDone] = useState(false);

    const dialogueWinner =
        battleOutcome === null ? null : battleOutcome.result === 'victory' ? 'attacker' : 'defender';

    const attackerDialogueInput = useMemo(
        () => (selectedFighter ? toDialoguePet(selectedFighter) : personasRef.current?.attacker ?? null),
        [selectedFighter, personasRef],
    );
    const defenderDialogueInput = useMemo(
        () => (opponent ? toDialoguePet(opponent) : personasRef.current?.defender ?? null),
        [opponent, personasRef],
    );

    const {
        turns: dialogueTurns,
        isLoading: dialogueLoading,
        isFetched: dialogueFetched,
    } = useBattleDialogue({
        chain: activeChainKind,
        battleId: settledBattleId,
        attacker: attackerDialogueInput,
        defender: defenderDialogueInput,
        winner: dialogueWinner,
        leveledUp: battleOutcome?.leveledUp ?? false,
        enabled: showResult && battleOutcome !== null,
    });

    // Taunts already played pre-fight — only show the AI result reactions here.
    const resultTurns = useMemo(
        () => dialogueTurns.filter((t) => t.phase === 'result'),
        [dialogueTurns],
    );

    // Don't leave the result actions gated when no dialogue will play: either the
    // query settled with nothing (generation failed / no result lines), or it
    // can't run at all (no battleId yet). isFetched (not !isLoading) avoids the
    // brief pre-fetch window. markResultDialogueDone handles the case where it plays.
    useEffect(() => {
        if (battleOutcome === null) return;
        const nothingToPlay = resultTurns.length === 0 && (dialogueFetched || settledBattleId === null);
        if (nothingToPlay) setResultDialogueDone(true);
    }, [battleOutcome, dialogueFetched, resultTurns.length, settledBattleId]);

    const markResultDialogueDone = useCallback(() => setResultDialogueDone(true), []);
    const resetResultDialogue = useCallback(() => setResultDialogueDone(false), []);

    return {
        resultTurns,
        dialogueLoading,
        resultDialogueDone,
        markResultDialogueDone,
        resetResultDialogue,
        attackerName: attackerDialogueInput?.name ?? 'Your pet',
        defenderName: defenderDialogueInput?.name ?? 'Opponent',
    };
}
