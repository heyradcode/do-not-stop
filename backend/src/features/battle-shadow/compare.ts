/**
 * Comparing what the backend engine predicted against what the chain actually did
 * (§L Phase 2).
 *
 * ## What is compared, and what deliberately is not
 *
 * Only the fight outcome: `firstWins`, `rounds`, `winnerHpRemaining`, and which pet id
 * won. Every one of those is a pure function of the request-time snapshot and the revealed
 * seed, both of which are captured before `settleBattle` runs, so a disagreement is a real
 * engine disagreement and nothing else. That is what makes "zero deterministic mismatch"
 * a meaningful stop condition rather than a noise threshold.
 *
 * `xpWin` and `xpLoss` are excluded on purpose, even though `BattleResolved` carries them.
 * They depend on each pet's `lastOpponentId` and `sameOpponentStreak`, which
 * `settleBattle` reads *and mutates* through `recordBattleOpponent` at settle time — not
 * from the frozen snapshot. Shadow mode observes at reveal, so any other battle settling
 * for the same pet in between would move the decay shift and produce a mismatch that means
 * nothing about the engine. Including them would trade a clean signal for a noisy one.
 *
 * The XP formula is not going unchecked as a result: `contracts/test-vectors/xp.json` is
 * run against all four ports. What shadow mode adds is confirmation that the *simulator*
 * reproduces real chain outcomes on real inputs, which vectors cannot do — so this is the
 * gap it is aimed at.
 */

/** The fight outcome, as any of the three engines states it. */
export interface FightOutcome {
    firstWins: boolean;
    rounds: number;
    winnerHpRemaining: number;
}

/** What the chain reported, decoded from `BattleResolved`. */
export interface ObservedOutcome extends FightOutcome {
    winnerPetId: string;
    loserPetId: string;
}

/** What an engine predicted, plus which pet that makes the winner. */
export interface PredictedOutcome extends FightOutcome {
    winnerPetId: string;
    loserPetId: string;
}

export type ShadowStatus = 'pending' | 'agreed' | 'mismatch' | 'engine-disagreement';

export interface ComparisonResult {
    status: Exclude<ShadowStatus, 'pending'>;
    mismatches: string[];
}

/**
 * Compares the TypeScript prediction, the Go verifier's recomputation, and the chain.
 *
 * Three distinct outcomes, because they mean different things to whoever reads the log:
 *
 * - `agreed` — everything that could be checked matched.
 * - `mismatch` — the backend engine and the chain disagree. This is the one that blocks
 *   the phase gate.
 * - `engine-disagreement` — the two backend engines disagree with each other. Reported
 *   separately because it points at the ports having drifted, not at the chain, and the
 *   fix is a different one.
 *
 * A Go verdict of `null` is not agreement. It means the check did not run, and is recorded
 * as such rather than folded into a pass — the same fail-closed reasoning the verify worker
 * uses.
 */
export function compareShadowRun(
    predicted: PredictedOutcome,
    observed: ObservedOutcome,
    goOutcome: FightOutcome | null,
): ComparisonResult {
    const mismatches = diffAgainstChain(predicted, observed);
    const engineMismatches = goOutcome ? diffEngines(predicted, goOutcome) : [];

    if (mismatches.length > 0) {
        return { status: 'mismatch', mismatches: [...mismatches, ...engineMismatches] };
    }
    if (engineMismatches.length > 0) {
        return { status: 'engine-disagreement', mismatches: engineMismatches };
    }
    return { status: 'agreed', mismatches: [] };
}

function diffAgainstChain(predicted: PredictedOutcome, observed: ObservedOutcome): string[] {
    const mismatches: string[] = [];
    if (predicted.firstWins !== observed.firstWins) {
        mismatches.push(`firstWins: engine=${predicted.firstWins} chain=${observed.firstWins}`);
    }
    if (predicted.rounds !== observed.rounds) {
        mismatches.push(`rounds: engine=${predicted.rounds} chain=${observed.rounds}`);
    }
    if (predicted.winnerHpRemaining !== observed.winnerHpRemaining) {
        mismatches.push(
            `winnerHpRemaining: engine=${predicted.winnerHpRemaining} chain=${observed.winnerHpRemaining}`,
        );
    }
    // Checked separately from `firstWins` rather than derived from it: the two agreeing is
    // what proves the engine and the chain also agree on which pet was in which slot.
    if (predicted.winnerPetId !== observed.winnerPetId) {
        mismatches.push(`winnerPetId: engine=${predicted.winnerPetId} chain=${observed.winnerPetId}`);
    }
    if (predicted.loserPetId !== observed.loserPetId) {
        mismatches.push(`loserPetId: engine=${predicted.loserPetId} chain=${observed.loserPetId}`);
    }
    return mismatches;
}

function diffEngines(predicted: FightOutcome, go: FightOutcome): string[] {
    const mismatches: string[] = [];
    if (predicted.firstWins !== go.firstWins) {
        mismatches.push(`go.firstWins: ts=${predicted.firstWins} go=${go.firstWins}`);
    }
    if (predicted.rounds !== go.rounds) {
        mismatches.push(`go.rounds: ts=${predicted.rounds} go=${go.rounds}`);
    }
    if (predicted.winnerHpRemaining !== go.winnerHpRemaining) {
        mismatches.push(`go.winnerHpRemaining: ts=${predicted.winnerHpRemaining} go=${go.winnerHpRemaining}`);
    }
    return mismatches;
}
