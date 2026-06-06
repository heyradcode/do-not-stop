import { useCallback, useEffect, useRef, useState } from 'react';
import type { Pet } from '@shared/core';
import type { BattleOutcome } from '@components/pet/interactions/panels/battle/types';
import type { PreBattleStats } from '@components/pet/interactions/panels/battle/battle-utils';

interface UseBattleOutcomeArgs {
    pets: Pet[];
    selectedPet1: string;
    petsLoading: boolean;
}

export interface UseBattleOutcome {
    /** Resolved victory/defeat, or null until the on-chain stats refresh. */
    battleOutcome: BattleOutcome;
    /** Snapshot the fighter's pre-battle stats and clear any prior outcome. */
    snapshotFighterStats: (fighter: Pet) => void;
    /** Arm outcome detection — call once the settle tx succeeds. */
    markPendingOutcome: () => void;
    /** Drop the captured snapshot (on leave). */
    clearSnapshot: () => void;
    /** Reset the resolved outcome back to null (on a new battle/rematch). */
    resetOutcome: () => void;
}

/**
 * Detect a battle's result by diffing the fighter's on-chain win/loss stats
 * against a snapshot taken just before the settle tx. Owns the snapshot/pending
 * refs and the detection effect so the panel doesn't have to.
 */
export function useBattleOutcome({ pets, selectedPet1, petsLoading }: UseBattleOutcomeArgs): UseBattleOutcome {
    const [battleOutcome, setBattleOutcome] = useState<BattleOutcome>(null);
    // Snapshot taken before battle.mutate; cleared after the outcome resolves.
    const preBattleStatsRef = useRef<PreBattleStats | null>(null);
    // Set true once the settle tx succeeds; cleared when the effect resolves it.
    const pendingOutcomeRef = useRef(false);

    const snapshotFighterStats = useCallback((fighter: Pet) => {
        preBattleStatsRef.current = {
            winCount: fighter.winCount,
            lossCount: fighter.lossCount,
            level: fighter.level,
        };
        pendingOutcomeRef.current = false;
        setBattleOutcome(null);
    }, []);

    const markPendingOutcome = useCallback(() => {
        pendingOutcomeRef.current = true;
    }, []);

    const clearSnapshot = useCallback(() => {
        preBattleStatsRef.current = null;
    }, []);

    const resetOutcome = useCallback(() => {
        setBattleOutcome(null);
    }, []);

    // After the settle tx, refetch() updates `pets` with the new on-chain stats.
    // Compare against the pre-battle snapshot to determine victory or defeat.
    useEffect(() => {
        if (!pendingOutcomeRef.current || !selectedPet1 || !preBattleStatsRef.current || petsLoading) return;

        const updatedFighter = pets.find((p) => p.id === selectedPet1);
        if (!updatedFighter) return;

        const { winCount: prevWin, lossCount: prevLoss, level: prevLevel } = preBattleStatsRef.current;
        // Stats haven't refreshed yet — wait for the next update.
        if (updatedFighter.winCount === prevWin && updatedFighter.lossCount === prevLoss) return;

        setBattleOutcome({
            result: updatedFighter.winCount > prevWin ? 'victory' : 'defeat',
            leveledUp: updatedFighter.level > prevLevel,
        });
        pendingOutcomeRef.current = false;
    }, [pets, selectedPet1, petsLoading]);

    return { battleOutcome, snapshotFighterStats, markPendingOutcome, clearSnapshot, resetOutcome };
}
