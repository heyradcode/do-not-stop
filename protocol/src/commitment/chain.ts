import type { Hex } from '../encoding/bytes';

import { hashBattleCommitment } from './hash';
import type { BattleCommitment } from './types';

/**
 * Commitments carry their own hash chain, so the sequence of accepted battles is
 * tamper-evident independently of receipts (§E).
 *
 * What that buys: an operator who accepted a battle and then quietly dropped it
 * leaves a gap, and an operator who issued two commitments for one `battleId`
 * leaves two chains that both claim the same predecessor. Neither is prevented by
 * the chain. Both become demonstrable with two signatures.
 */

/** Why a chain does not hold. */
export type ChainFailure =
    | 'wrong-anchor'
    | 'broken-link'
    | 'duplicate-battle-id'
    | 'time-went-backwards';

export type ChainResult = { ok: true } | { ok: false; index: number; reason: ChainFailure };

/**
 * Checks that a run of commitments forms an unbroken chain.
 *
 * `expectedAnchor` is what the first element must link back to: pass the hash of
 * the commitment preceding this window, or `null` if the window starts at the very
 * first commitment under the key. Pass `undefined` to skip the anchor check when
 * auditing a slice out of the middle without its predecessor to hand.
 *
 * Also rejects a repeated `battleId` and a commitment that claims to precede its
 * own predecessor in time. Neither is a hash-chain property, but both are cheap
 * here and are exactly the shapes a fabricated history takes.
 */
export function verifyCommitmentChain(
    commitments: readonly BattleCommitment[],
    expectedAnchor?: Hex | null,
): ChainResult {
    const seenBattleIds = new Set<string>();
    let previousHash: Hex | null | undefined = expectedAnchor;
    let previousAcceptedAt: number | undefined;

    for (let index = 0; index < commitments.length; index++) {
        const commitment = commitments[index]!;

        if (previousHash !== undefined && commitment.previousCommitmentHash !== previousHash) {
            return { ok: false, index, reason: index === 0 ? 'wrong-anchor' : 'broken-link' };
        }
        if (seenBattleIds.has(commitment.battleId)) {
            return { ok: false, index, reason: 'duplicate-battle-id' };
        }
        if (previousAcceptedAt !== undefined && commitment.acceptedAt < previousAcceptedAt) {
            return { ok: false, index, reason: 'time-went-backwards' };
        }

        seenBattleIds.add(commitment.battleId);
        previousHash = hashBattleCommitment(commitment);
        previousAcceptedAt = commitment.acceptedAt;
    }

    return { ok: true };
}

/**
 * Detects equivocation: two commitments for one `battleId`, each signed, which is
 * what a reroll looks like from the outside.
 *
 * Returns the conflicting battle ids. An empty result is not proof of honesty,
 * only that these particular commitments do not contradict each other.
 */
export function findEquivocations(commitments: readonly BattleCommitment[]): string[] {
    const hashesByBattleId = new Map<string, Set<Hex>>();
    for (const commitment of commitments) {
        const hashes = hashesByBattleId.get(commitment.battleId) ?? new Set<Hex>();
        hashes.add(hashBattleCommitment(commitment));
        hashesByBattleId.set(commitment.battleId, hashes);
    }
    return [...hashesByBattleId.entries()].filter(([, hashes]) => hashes.size > 1).map(([battleId]) => battleId);
}
