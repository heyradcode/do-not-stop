import { computeProgression, type PetProgression, type ProgressionParams } from '../progression/progression';
import { resolveDrandChain, verifyBeacon } from '../randomness/drand';

import { assertBattleReceipt, type BattleReceipt } from './types';

/**
 * The checks a receipt can be held to on its own, without the combat log and without any
 * data from us.
 *
 * `assertBattleReceipt` already covers the cheap internal consistency (randomness is the
 * signature hash, seed follows from the inputs, times are ordered). This adds the two
 * expensive ones: the BLS signature, and recomputing the progression delta.
 *
 * What is *not* here: replaying the fight itself. That needs the combat log, which the
 * receipt only references, so it belongs to the standalone verifier where the log is
 * fetched alongside. Progression is checkable here because the snapshot carries the
 * streak state it depends on.
 */

export type ReceiptCheck = 'beacon-signature' | 'progression';

export interface ReceiptCheckFailure {
    check: ReceiptCheck;
    detail: string;
}

export type ReceiptVerification = { ok: true } | { ok: false; failures: ReceiptCheckFailure[] };

/**
 * Verifies a receipt's beacon and progression.
 *
 * Reports every failure rather than the first, because "the beacon is forged and the XP
 * is wrong" and "the XP is wrong" are different situations and the difference matters
 * when deciding what a mismatch means.
 *
 * `params` supplies the level cap, which lives in the ruleset the receipt names. A caller
 * that has loaded the pinned ruleset bundle passes its values; passing the wrong ones
 * produces a progression mismatch, which is the correct outcome rather than a false pass.
 */
export function verifyReceiptConsistency(receipt: BattleReceipt, params: ProgressionParams): ReceiptVerification {
    const checked = assertBattleReceipt(receipt);
    const failures: ReceiptCheckFailure[] = [];

    const chain = resolveDrandChain(checked.beacon.chainHash);
    if (!verifyBeacon(chain, { round: checked.beacon.round, signature: checked.beacon.signature })) {
        failures.push({
            check: 'beacon-signature',
            detail: `drand round ${checked.beacon.round} does not verify against chain ${chain.chainHash}`,
        });
    }

    const recomputed = computeProgression(checked.snapshot, checked.result.attackerWon, params);
    const mismatches = [
        ...compareProgression('attacker', recomputed.attacker, checked.progression.attacker),
        ...compareProgression('defender', recomputed.defender, checked.progression.defender),
    ];
    if (mismatches.length > 0) {
        failures.push({ check: 'progression', detail: mismatches.join('; ') });
    }

    return failures.length === 0 ? { ok: true } : { ok: false, failures };
}

const PROGRESSION_FIELDS = [
    'petId',
    'won',
    'decayShift',
    'xpAwarded',
    'lastOpponentId',
    'streak',
    'level',
    'xp',
    'leveledUp',
] as const satisfies readonly (keyof PetProgression)[];

function compareProgression(side: string, expected: PetProgression, actual: PetProgression | undefined): string[] {
    if (!actual) {
        return [`${side} progression missing`];
    }
    const differences: string[] = [];
    for (const field of PROGRESSION_FIELDS) {
        // Stringified so bigint and number fields compare the same way, and so the
        // message reads the same for both.
        if (String(expected[field]) !== String(actual[field])) {
            differences.push(`${side}.${field}: expected ${String(expected[field])}, got ${String(actual[field])}`);
        }
    }
    return differences;
}
