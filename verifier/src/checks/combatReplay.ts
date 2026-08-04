import { type BattleReceipt, hashCombatLog, type Ruleset, simulate } from '@cryptopets/protocol';

import type { CheckResult } from './types';

/**
 * Re-runs the fight and compares it to what the receipt claims (§F, §H item 1).
 *
 * This is the check the whole design exists for. Every input the engine consumes is in the
 * receipt — both pets frozen at acceptance, the seed, and the ruleset it names — so a
 * stranger can run the same simulation and get the same answer, or not. Nothing here asks
 * the operator for anything.
 *
 * Both the summary result and the blow-by-blow log are compared. The summary alone would
 * miss a receipt whose winner and round count are honest but whose published log tells a
 * different story about how it got there, so the recomputed log's hash is checked against
 * `combatLogHash` as well. That also means the log served separately by the operator
 * (`GET /api/battle/:battleId/combat-log`, §G) is pinned transitively: anything hashing to
 * `combatLogHash` is, by collision resistance, the log this replay produced.
 *
 * The `ruleset` must be the bundle the receipt names — the caller resolves it by hash, so
 * a mismatched bundle is not something this function can be handed.
 */
export function checkCombatReplay(receipt: BattleReceipt, ruleset: Ruleset): CheckResult {
    const check = 'combat-replay';
    const { attacker, defender } = receipt.snapshot;

    let outcome: ReturnType<typeof simulate>;
    try {
        outcome = simulate(
            attacker.dna,
            attacker.rarity,
            attacker.level,
            attacker.skill,
            defender.dna,
            defender.rarity,
            defender.level,
            defender.skill,
            BigInt(receipt.seed),
            ruleset.skillConfig,
        );
    } catch (error) {
        return { check, ok: false, detail: `replay could not run: ${(error as Error).message}` };
    }

    const mismatches: string[] = [];
    if (outcome.result.firstWins !== receipt.result.attackerWon) {
        mismatches.push(`attackerWon: replay=${outcome.result.firstWins} receipt=${receipt.result.attackerWon}`);
    }
    if (outcome.result.rounds !== receipt.result.rounds) {
        mismatches.push(`rounds: replay=${outcome.result.rounds} receipt=${receipt.result.rounds}`);
    }
    if (outcome.result.winnerHpRemaining !== receipt.result.winnerHpRemaining) {
        mismatches.push(
            `winnerHpRemaining: replay=${outcome.result.winnerHpRemaining} receipt=${receipt.result.winnerHpRemaining}`,
        );
    }
    const replayedLogHash = hashCombatLog(outcome);
    if (replayedLogHash.toLowerCase() !== receipt.combatLogHash.toLowerCase()) {
        mismatches.push(`combatLogHash: replay=${replayedLogHash} receipt=${receipt.combatLogHash}`);
    }

    return mismatches.length === 0 ? { check, ok: true } : { check, ok: false, detail: mismatches.join('; ') };
}
