import { useMemo } from 'react';
import { simulate, type SimOutcome, type SkillConfig } from '../../../utils/combat';

export interface LiveBattleReplayInput {
    dna1: bigint;
    rarity1: number;
    level1: number;
    speciesId1: number;
    dna2: bigint;
    rarity2: number;
    level2: number;
    speciesId2: number;
    /** The revealed Pyth Entropy word — the exact seed settleBattle will simulate from. */
    randomNumber: bigint;
    skillConfig: SkillConfig;
}

/**
 * Runs the client-side combat sim (shared/src/utils/combat) the instant all
 * its inputs are known — right after entropy reveals, independent of when
 * settleBattle actually gets mined by the settle keeper. Presentation only:
 * the on-chain `BattleResolved` event is always the authoritative result (see
 * plan-realtime-battle-ux.md's reconciliation rule) — this hook's output
 * drives the live round-by-round animation, never the final verdict.
 *
 * `input` is expected to be memoized by the caller (useEvmBattleFlow) so this
 * only recomputes when an actual input value changes, not on every render.
 */
export function useLiveBattleReplay(input: LiveBattleReplayInput | null): SimOutcome | null {
    return useMemo(() => {
        if (!input) return null;
        const skill1 = input.speciesId1 % 8;
        const skill2 = input.speciesId2 % 8;
        return simulate(
            input.dna1, input.rarity1, input.level1, skill1,
            input.dna2, input.rarity2, input.level2, skill2,
            input.randomNumber, input.skillConfig,
        );
    }, [input]);
}
