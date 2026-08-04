import { buildMerkleTree, type Hex, merkleLeaf, merkleProof } from '@cryptopets/protocol';
import { keccak256, toBytes } from 'viem';

/**
 * Turning a run of signed receipts into the batch §I commits to.
 *
 * Pure: it takes receipts and returns a root, so the shape of a batch can be tested
 * without a database, a chain, or a wallet anywhere near it.
 */

export interface BatchableReceipt {
    receiptHash: string;
    sequence: bigint;
    rulesetHash: string;
}

export interface BuiltBatch {
    merkleRoot: Hex;
    rulesetSetHash: Hex;
    firstSequence: bigint;
    lastSequence: bigint;
    /** Leaf order, which proofs are generated against. */
    receiptHashes: string[];
    proofFor(receiptHash: string): Hex[];
}

/**
 * Builds a batch over receipts **in sequence order**.
 *
 * Ordering is not cosmetic. The registry enforces that each batch's `firstSequence`
 * continues the previous batch's `lastSequence`, so a batch assembled out of order, or with
 * a hole in it, is rejected on chain rather than quietly anchoring a partial history. This
 * function refuses the same things locally so the failure surfaces before a transaction is
 * paid for.
 *
 * A gap in the middle of a run is the interesting case: it means a receipt that should have
 * been batched is missing — withheld, lost, or still unpublished. Anchoring around it would
 * produce a root that looks complete while omitting a battle, which is precisely the
 * omission §I says must stay visible. So it throws, and the operator has to decide whether
 * to wait for the missing receipt or to batch only the contiguous prefix.
 */
export function buildBatch(receipts: readonly BatchableReceipt[]): BuiltBatch {
    if (receipts.length === 0) {
        throw new Error('cannot build a batch with no receipts');
    }

    const ordered = [...receipts].sort((a, b) => (a.sequence === b.sequence ? 0 : a.sequence < b.sequence ? -1 : 1));
    for (let i = 1; i < ordered.length; i++) {
        const previous = ordered[i - 1]!.sequence;
        const current = ordered[i]!.sequence;
        if (current === previous) {
            throw new Error(`duplicate receipt sequence ${current} in batch`);
        }
        if (current !== previous + 1n) {
            throw new Error(
                `receipt sequence gap: ${previous} is followed by ${current}. A batch must cover a ` +
                    'contiguous run, or it would anchor a history with a hole in it',
            );
        }
    }

    const receiptHashes = ordered.map((receipt) => receipt.receiptHash);
    const leaves = receiptHashes.map((hash) => merkleLeaf(hash as Hex));
    const tree = buildMerkleTree(leaves);
    const indexByHash = new Map(receiptHashes.map((hash, index) => [hash.toLowerCase(), index]));

    return {
        merkleRoot: tree.root,
        rulesetSetHash: hashRulesetSet(ordered.map((receipt) => receipt.rulesetHash)),
        firstSequence: ordered[0]!.sequence,
        lastSequence: ordered[ordered.length - 1]!.sequence,
        receiptHashes,
        proofFor(receiptHash: string): Hex[] {
            const index = indexByHash.get(receiptHash.toLowerCase());
            if (index === undefined) {
                throw new Error(`receipt ${receiptHash} is not in this batch`);
            }
            return merkleProof(tree, index);
        },
    };
}

/**
 * Hashes the *set* of ruleset hashes the batched receipts were fought under.
 *
 * Deduplicated and sorted, so the value depends on which rulesets appear and not on how
 * many battles happened to use each or what order they landed in. A batch of a thousand
 * receipts all under one ruleset produces the same `rulesetSetHash` as a batch of two, which
 * is the point: this field answers "which rules govern the contents of this batch", and a
 * verifier checking it should not have to reconstruct battle ordering to do so.
 */
export function hashRulesetSet(rulesetHashes: readonly string[]): Hex {
    const unique = [...new Set(rulesetHashes.map((hash) => hash.toLowerCase()))].sort();
    return keccak256(toBytes(`cryptopets/ruleset-set/v1|${unique.join(',')}`));
}
