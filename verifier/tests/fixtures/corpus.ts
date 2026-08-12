import { type BattleReceipt, hashBattleReceipt, type Hex } from '@cryptopets/protocol';

import type { SignedReceiptEnvelope, TrustedSigningKey } from '../../src/io/types';

import {
    buildReceipt,
    envelopeFor,
    FORGED_BEACON,
    GEARED_RULESET,
    gearedSnapshot,
    SOLANA_SIGNING_KEY_ID,
    SOLANA_SNAPSHOT,
    testTrustedKey,
} from './signedReceipt';

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

        // The last receipt is geared, under a ruleset that prices what it wears (roadmap
        // §4). Appended rather than swapped in: the earlier receipts stay ungeared under
        // the original ruleset, so this corpus keeps proving that battles signed before
        // equipment existed still verify.
        const geared =
            index === CORPUS_SIZE - 1
                ? { snapshot: gearedSnapshot(), ruleset: GEARED_RULESET }
                : {};
        const receipt = index === tamperAt ? tamper({ ...links, ...geared }) : buildReceipt({ ...links, ...geared });
        receipts.push(receipt);
        // Deliberately the *honest* hash: a chain built on the tampered receipt's own hash
        // would be internally consistent again, which is the opposite of the fixture's job.
        previousReceiptHash = hashBattleReceipt(buildReceipt({ ...links, ...geared }));
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

/**
 * The trusted key list matching the corpus signatures.
 *
 * Both keys, not just the one `corpus.json` uses. `listSigningKeys` hands a verifier every
 * key a deployment signs under and lets it match on `signingKeyId`, so a list carrying only
 * the EVM key would make the cross-chain corpus fail on a missing key rather than on
 * anything real.
 */
export function corpusSigningKeys(): { keys: TrustedSigningKey[] } {
    return { keys: [testTrustedKey(), testTrustedKey(SOLANA_SIGNING_KEY_ID)] };
}

/**
 * The wallet-view corpus: one player's battles across both chains.
 *
 * `corpus.json` above is a page from `GET /api/receipts?signingKeyId=...`, which is per key
 * by construction and so can never mix. The per-wallet and per-pet views can and do — a
 * deployment serving EVM and Solana signs under two keys (§G), and a player who fought on
 * both appears in each. That is the shape that reported `mixed-signing-key` against an
 * honest operator until the chain walk was split per key, so it is worth committing rather
 * than leaving to unit tests alone.
 *
 * Ordered by `createdAt` like the wallet endpoint orders it, which interleaves the two
 * chains. Each key's own run stays correctly linked; neither is contiguous in this list.
 */
const CROSS_CHAIN_SIZE = 2;

function buildCrossChainReceipts(): BattleReceipt[] {
    const domains = [
        { snapshot: undefined, signingKeyId: undefined, tag: 'evm' },
        { snapshot: SOLANA_SNAPSHOT, signingKeyId: SOLANA_SIGNING_KEY_ID, tag: 'sol' },
    ] as const;

    const byDomain = domains.map(({ snapshot, signingKeyId, tag }) => {
        const run: BattleReceipt[] = [];
        let previousReceiptHash: Hex | null = null;
        for (let index = 0; index < CROSS_CHAIN_SIZE; index++) {
            const receipt = buildReceipt({
                battleId: `btl_${tag}_${index + 1}`,
                sequence: index + 1,
                previousReceiptHash,
                attackerPreviousReceiptHash: previousReceiptHash,
                defenderPreviousReceiptHash: previousReceiptHash,
                // Interleaved in time: each chain's second battle happens after the other
                // chain's first, which is what makes the wallet view alternate between them.
                createdAt: CROSS_CHAIN_BASE_TIME + index * 2 + (tag === 'sol' ? 1 : 0),
                ...(snapshot ? { snapshot } : {}),
                ...(signingKeyId ? { signingKeyId } : {}),
            });
            run.push(receipt);
            previousReceiptHash = hashBattleReceipt(receipt);
        }
        return run;
    });

    return byDomain.flat().sort((a, b) => a.createdAt - b.createdAt);
}

/** Base timestamp for the interleave, after the beacon's own publication time. */
const CROSS_CHAIN_BASE_TIME = buildReceipt().createdAt;

/** A valid dual-chain wallet page. CI asserts this verifies clean. */
export function buildCrossChainCorpus(): CorpusPage {
    return { receipts: buildCrossChainReceipts().map((receipt) => envelopeFor(receipt)), nextCursor: null };
}
