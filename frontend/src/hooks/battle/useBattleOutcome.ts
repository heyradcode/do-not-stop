import { useCallback, useState } from 'react';
import type { BattleOutcome } from '@components/pet/interactions/panels/battle/types';

export interface UseBattleOutcome {
    /** Resolved victory/defeat, or null until the receipt has verified. */
    battleOutcome: BattleOutcome;
    /** Clear any prior outcome, ready for a new battle. */
    resetOutcome: () => void;
    /**
     * Apply the verdict from the verified battle receipt.
     *
     * Both the win/lose and whether the pet levelled up come straight from the receipt's own
     * progression delta, so the result is exact and immediate.
     */
    applyResolvedOutcome: (playerWon: boolean, leveledUp: boolean) => void;
}

/**
 * Holds a battle's resolved result.
 *
 * This used to be considerably more involved: it snapshotted the fighter's pre-battle
 * win/loss/level, then watched refreshed on-chain stats for a diff, using that to derive the
 * verdict on Solana and `leveledUp` everywhere.
 *
 * None of that works any more, and none of it is needed. Backend battles never move on-chain
 * pet stats — progression lives in `pet_battle_progress`, keyed separately from NFT state —
 * so a stats diff could only ever wait forever. The signed receipt carries both values
 * directly, which is also strictly better: exact rather than inferred, and available the
 * moment the receipt verifies rather than whenever an indexer catches up.
 */
export const useBattleOutcome = (): UseBattleOutcome => {
    const [battleOutcome, setBattleOutcome] = useState<BattleOutcome>(null);

    const applyResolvedOutcome = useCallback((playerWon: boolean, leveledUp: boolean) => {
        setBattleOutcome({ result: playerWon ? 'victory' : 'defeat', leveledUp });
    }, []);

    const resetOutcome = useCallback(() => setBattleOutcome(null), []);

    return { battleOutcome, applyResolvedOutcome, resetOutcome };
};
