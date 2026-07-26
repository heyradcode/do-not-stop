import { type BattleReceipt, hashBattleReceipt, type Hex } from '@cryptopets/protocol';

import type { SignedReceiptEnvelope, TrustedSigningKey } from '../../src/io/types';

import { buildReceipt, envelopeFor, FORGED_BEACON, testTrustedKey } from './signedReceipt';

/**
 * The committed regression corpus (§H item 3's export shape, used here as a fixture).
 *
 * Three receipts under one signing key, properly linked on all three chains: the global
 * one and both pets' own. That exercises every check the verifier makes, including the
 * multi-receipt continuity walk a single receipt cannot.
 *
 * Shaped exactly like a corpus page from `GET /api/receipts?signingKeyId=...`, so the
 * fixture doubles as a worked example of that endpoint's output and `loadReceipts` reads
 * it with no special casing.
 */

export interface CorpusPage {
    receipts: SignedReceiptEnvelope[];
    nextCursor: string | null;
}

const CORPUS_SIZE = 3;

/**
 * Builds the linked chain of receipts.
 *
 * `tamperAt` rebuilds one position with a broken receipt while leaving its links intact,
 * so the resulting corpus is broken in the way a real tampered corpus would be: the
 * altered receipt fails its own checks, *and* every later receipt's link no longer
 * matches, because that is precisely what the chain is for.
 */
function buildChain(tamperAt?: number): BattleReceipt[] {
    const receipts: BattleReceipt[] = [];
    let previousReceiptHash: Hex | null = null;
    let createdAt: number | undefined;

    for (let index = 0; index < CORPUS_SIZE; index++) {
        const links = {
            battleId: `btl_${String(index + 1).padStart(4, '0')}`,
            sequence: index + 1,
            previousReceiptHash,
            // Both pets fight in every battle here, so each one's own chain advances in
            // lockstep with the global one.
            attackerPreviousReceiptHash: previousReceiptHash,
            defenderPreviousReceiptHash: previousReceiptHash,
            ...(createdAt === undefined ? {} : { createdAt }),
        };

        const receipt = index === tamperAt ? tamper(links) : buildReceipt(links);
        receipts.push(receipt);
        // Deliberately the *honest* hash: a chain built on the tampered receipt's own hash
        // would be internally consistent again, which is the opposite of the fixture's job.
        previousReceiptHash = hashBattleReceipt(buildReceipt(links));
        createdAt = receipt.createdAt + 1;
    }

    return receipts;
}

/**
 * One receipt, altered two ways at once.
 *
 * Layered on purpose: the round count no longer matches a replay, and the beacon is a real
 * signature from a different round, so the BLS check fails too. Both must be reported, not
 * just whichever is found first.
 */
function tamper(links: Parameters<typeof buildReceipt>[0]): BattleReceipt {
    const honest = buildReceipt({ ...links, beacon: FORGED_BEACON });
    return buildReceipt({
        ...links,
        beacon: FORGED_BEACON,
        patch: { result: { ...honest.result, rounds: honest.result.rounds + 1 } },
    });
}

/** A valid, fully verifiable chain. This is what CI asserts still passes. */
export function buildCorpus(): CorpusPage {
    return { receipts: buildChain().map((receipt) => envelopeFor(receipt)), nextCursor: null };
}

/**
 * The same chain with the middle receipt broken.
 *
 * CI asserts this one *fails*. A corpus that only ever proves the verifier passes would be
 * satisfied just as well by a verifier that had degraded into always passing, which is the
 * exact regression worth guarding against.
 */
export function buildTamperedCorpus(): CorpusPage {
    return { receipts: buildChain(1).map((receipt) => envelopeFor(receipt)), nextCursor: null };
}

/** The trusted key list matching the corpus signatures. */
export function corpusSigningKeys(): { keys: TrustedSigningKey[] } {
    return { keys: [testTrustedKey()] };
}
