import { describe, expect, it } from 'vitest';

import { merkleLeaf, verifyReceiptInclusion, type Hex } from '@cryptopets/protocol';

import { buildBatch, hashRulesetSet, type BatchableReceipt } from '@features/battle/batcher';

const RULESET_A = `0x${'aa'.repeat(32)}`;
const RULESET_B = `0x${'bb'.repeat(32)}`;

function receipt(sequence: number, rulesetHash = RULESET_A): BatchableReceipt {
    return {
        receiptHash: `0x${sequence.toString(16).padStart(64, '0')}`,
        sequence: BigInt(sequence),
        rulesetHash,
    };
}

function run(from: number, to: number, rulesetHash = RULESET_A): BatchableReceipt[] {
    return Array.from({ length: to - from + 1 }, (_, i) => receipt(from + i, rulesetHash));
}

describe('building a batch', () => {
    it('commits the sequence range it covers', () => {
        const batch = buildBatch(run(1, 5));
        expect(batch.firstSequence).toBe(1n);
        expect(batch.lastSequence).toBe(5n);
        expect(batch.receiptHashes).toHaveLength(5);
    });

    it('orders leaves by sequence regardless of the order it was handed', () => {
        // The registry enforces contiguity on chain, so a batch assembled out of order
        // would be rejected after paying for the transaction.
        const shuffled = [receipt(3), receipt(1), receipt(5), receipt(2), receipt(4)];
        expect(buildBatch(shuffled).receiptHashes).toEqual(buildBatch(run(1, 5)).receiptHashes);
    });

    it('is deterministic', () => {
        expect(buildBatch(run(1, 8)).merkleRoot).toBe(buildBatch(run(1, 8)).merkleRoot);
    });

    it('produces a different root when membership changes', () => {
        expect(buildBatch(run(1, 5)).merkleRoot).not.toBe(buildBatch(run(1, 6)).merkleRoot);
    });

    it('handles a single-receipt batch', () => {
        const batch = buildBatch([receipt(7)]);
        expect(batch.firstSequence).toBe(7n);
        expect(batch.lastSequence).toBe(7n);
    });

    it('refuses an empty batch', () => {
        expect(() => buildBatch([])).toThrow(/no receipts/);
    });
});

describe('refusing to anchor a history with a hole in it', () => {
    it('rejects a gap in the middle of the run', () => {
        // Anchoring around a missing receipt would produce a root that looks complete while
        // omitting a battle — the omission §I says has to stay visible.
        expect(() => buildBatch([receipt(1), receipt(2), receipt(4)])).toThrow(/sequence gap/);
    });

    it('names both sides of the gap, so the missing receipt is identifiable', () => {
        expect(() => buildBatch([receipt(1), receipt(9)])).toThrow(/1 is followed by 9/);
    });

    it('rejects a duplicated sequence', () => {
        expect(() => buildBatch([receipt(1), receipt(1)])).toThrow(/duplicate receipt sequence/);
    });
});

describe('inclusion proofs', () => {
    it('proves every member against the root', () => {
        const receipts = run(1, 9);
        const batch = buildBatch(receipts);

        for (const member of receipts) {
            const proof = batch.proofFor(member.receiptHash);
            expect(verifyReceiptInclusion(member.receiptHash as Hex, proof, batch.merkleRoot)).toBe(true);
        }
    });

    it('proves membership in an odd-sized tree, where promotion makes proof lengths vary', () => {
        const receipts = run(1, 7);
        const batch = buildBatch(receipts);
        expect(
            receipts.every((m) => verifyReceiptInclusion(m.receiptHash as Hex, batch.proofFor(m.receiptHash), batch.merkleRoot)),
        ).toBe(true);
    });

    it('does not prove a receipt that is not in the batch', () => {
        const batch = buildBatch(run(1, 5));
        const outsider = receipt(99);
        const someProof = batch.proofFor(batch.receiptHashes[0]!);

        expect(verifyReceiptInclusion(outsider.receiptHash as Hex, someProof, batch.merkleRoot)).toBe(false);
    });

    it('refuses to produce a proof for a non-member', () => {
        const batch = buildBatch(run(1, 5));
        expect(() => batch.proofFor(`0x${'ff'.repeat(32)}`)).toThrow(/not in this batch/);
    });

    it('matches leaves case-insensitively, since hex casing is not identity', () => {
        const batch = buildBatch(run(1, 4));
        const upper = batch.receiptHashes[2]!.toUpperCase().replace('0X', '0x');
        expect(() => batch.proofFor(upper)).not.toThrow();
    });

    it('builds leaves through the protocol domain-separated hash, not the raw receipt hash', () => {
        // A tree over raw hashes would let a receipt hash be reinterpreted as an internal
        // node; the leaf domain tag is what stops that.
        const batch = buildBatch([receipt(1)]);
        expect(batch.merkleRoot).toBe(merkleLeaf(receipt(1).receiptHash as Hex));
    });
});

describe('hashRulesetSet', () => {
    it('depends on which rulesets appear, not how many receipts used each', () => {
        // The field answers "which rules govern this batch"; a verifier checking it should
        // not have to reconstruct battle ordering.
        expect(hashRulesetSet([RULESET_A, RULESET_A, RULESET_A])).toBe(hashRulesetSet([RULESET_A]));
    });

    it('is order independent', () => {
        expect(hashRulesetSet([RULESET_A, RULESET_B])).toBe(hashRulesetSet([RULESET_B, RULESET_A]));
    });

    it('is case insensitive', () => {
        expect(hashRulesetSet([RULESET_A.toUpperCase().replace('0X', '0x')])).toBe(hashRulesetSet([RULESET_A]));
    });

    it('changes when a new ruleset enters the batch', () => {
        expect(hashRulesetSet([RULESET_A])).not.toBe(hashRulesetSet([RULESET_A, RULESET_B]));
    });

    it('flows through to the built batch', () => {
        const mixed = [...run(1, 2, RULESET_A), ...run(3, 4, RULESET_B)];
        expect(buildBatch(mixed).rulesetSetHash).toBe(hashRulesetSet([RULESET_A, RULESET_B]));
    });
});
