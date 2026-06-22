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
    /**
     * Apply the authoritative win/lose from the on-chain BattleResolved event
     * (EVM). Resolves the result immediately and exactly; the stats refetch then
     * only fills in `leveledUp` (the event carries no post-battle level).
     */
    applyResolvedOutcome: (playerWon: boolean) => void;
    /** Drop the captured snapshot (on leave). */
    clearSnapshot: () => void;
    /** Reset the resolved outcome back to null (on a new battle/rematch). */
    resetOutcome: () => void;
}

/**
 * Resolve a battle's result. On EVM the win/lose comes authoritatively from the
 * BattleResolved event (`applyResolvedOutcome`); the on-chain stats refetch then
 * only supplies `leveledUp`. On Solana (no event surfaced here) it falls back to
 * diffing the fighter's win/loss stats against a pre-battle snapshot.
 */
export const useBattleOutcome = ({
    pets,
    selectedPet1,
    petsLoading,
}: UseBattleOutcomeArgs): UseBattleOutcome => {
    const [battleOutcome, setBattleOutcome] = useState<BattleOutcome>(null);
    // Snapshot taken before battle.mutate; cleared after the outcome resolves.
    const preBattleStatsRef = useRef<PreBattleStats | null>(null);
    // Set true once the settle tx succeeds; cleared when the effect resolves it.
    const pendingOutcomeRef = useRef(false);
    // Authoritative win/lose from BattleResolved (EVM); null = use the stat diff.
    const authoritativeRef = useRef<'victory' | 'defeat' | null>(null);

    const snapshotFighterStats = useCallback((fighter: Pet) => {
        preBattleStatsRef.current = {
            winCount: fighter.winCount,
            lossCount: fighter.lossCount,
            level: fighter.level,
        };
        pendingOutcomeRef.current = false;
        authoritativeRef.current = null;
        setBattleOutcome(null);
    }, []);

    const markPendingOutcome = useCallback(() => {
        pendingOutcomeRef.current = true;
    }, []);

    const applyResolvedOutcome = useCallback((playerWon: boolean) => {
        const result = playerWon ? 'victory' : 'defeat';
        authoritativeRef.current = result;
        // Show the verdict at once; leveledUp is filled by the stats effect below.
        setBattleOutcome((prev) => ({ result, leveledUp: prev?.leveledUp ?? false }));
    }, []);

    const clearSnapshot = useCallback(() => {
        preBattleStatsRef.current = null;
    }, []);

    const resetOutcome = useCallback(() => {
        authoritativeRef.current = null;
        setBattleOutcome(null);
    }, []);

    // After the settle tx, refetch() updates `pets` with the new on-chain stats.
    // The stat diff supplies `leveledUp`, and the win/lose result when no
    // authoritative on-chain result was applied (Solana).
    useEffect(() => {
        if (
            !pendingOutcomeRef.current ||
            !selectedPet1 ||
            !preBattleStatsRef.current ||
            petsLoading
        )
            return;

        const updatedFighter = pets.find((p) => p.id === selectedPet1);
        if (!updatedFighter) return;

        const {
            winCount: prevWin,
            lossCount: prevLoss,
            level: prevLevel,
        } = preBattleStatsRef.current;
        // Stats haven't refreshed yet — wait for the next update.
        if (updatedFighter.winCount === prevWin && updatedFighter.lossCount === prevLoss) return;

        setBattleOutcome({
            result:
                authoritativeRef.current ??
                (updatedFighter.winCount > prevWin ? 'victory' : 'defeat'),
            leveledUp: updatedFighter.level > prevLevel,
        });
        pendingOutcomeRef.current = false;
    }, [pets, selectedPet1, petsLoading]);

    return {
        battleOutcome,
        snapshotFighterStats,
        markPendingOutcome,
        applyResolvedOutcome,
        clearSnapshot,
        resetOutcome,
    };
};
