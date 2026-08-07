import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/env', () => ({ env: { battle: { batchMinSize: 1, batchMaxSize: 1000 } } }));

vi.mock('@config/prisma', () => {
    const tx = {
        battleBatch: { create: vi.fn() },
        battleReceipt: { updateMany: vi.fn() },
        battleLedger: { updateMany: vi.fn() },
    };
    return {
        prisma: {
            battleBatch: { findFirst: vi.fn(), findUnique: vi.fn() },
            battleReceipt: { findMany: vi.fn(), findUnique: vi.fn() },
            $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
            __tx: tx,
        },
    };
});

import { prisma } from '@config/prisma';
import { buildBatch, buildNextBatch, getInclusionProof } from '@features/battle/batcher';

const RULESET = `0x${'aa'.repeat(32)}`;
const SCOPE = { chainId: 'eip155:84532', deploymentId: 'base-sepolia-live' };
const tx = (prisma as unknown as { __tx: Record<string, Record<string, ReturnType<typeof vi.fn>>> }).__tx;

function row(sequence: number) {
    return {
        receiptHash: `0x${sequence.toString(16).padStart(64, '0')}`,
        sequence: BigInt(sequence),
        battleId: `btl_${sequence}`,
        payload: { rulesetHash: RULESET },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.battleBatch.findFirst).mockResolvedValue(null);
    tx.battleBatch.create.mockResolvedValue({ id: 'batch_1' });
    tx.battleReceipt.updateMany.mockResolvedValue({ count: 0 });
    tx.battleLedger.updateMany.mockResolvedValue({ count: 1 });
});

describe('assembling the next batch', () => {
    it('batches a contiguous run starting at sequence 1', async () => {
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([row(1), row(2), row(3)] as never);

        const outcome = await buildNextBatch(SCOPE);

        expect(outcome).toMatchObject({ status: 'batched', batchNumber: 1n, receiptCount: 3 });
        const created = tx.battleBatch.create.mock.calls[0]![0] as { data: Record<string, unknown> };
        expect(created.data.firstSequence).toBe(1n);
        expect(created.data.lastSequence).toBe(3n);
        expect(created.data.previousRoot).toBeNull();
    });

    it('continues from the previous batch, linking to its root', async () => {
        vi.mocked(prisma.battleBatch.findFirst).mockResolvedValue({
            batchNumber: 4n,
            lastSequence: 40n,
            merkleRoot: `0x${'99'.repeat(32)}`,
        } as never);
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([row(41), row(42)] as never);

        const outcome = await buildNextBatch(SCOPE);

        expect(outcome).toMatchObject({ status: 'batched', batchNumber: 5n });
        const created = tx.battleBatch.create.mock.calls[0]![0] as { data: Record<string, unknown> };
        expect(created.data.previousRoot).toBe(`0x${'99'.repeat(32)}`);
        expect(created.data.firstSequence).toBe(41n);
    });

    it('reports nothing to batch when no receipts are published', async () => {
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([] as never);
        await expect(buildNextBatch(SCOPE)).resolves.toEqual({ status: 'nothing-to-batch' });
        expect(tx.battleBatch.create).not.toHaveBeenCalled();
    });

    it('holds below the minimum batch size rather than spending a transaction on it', async () => {
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([row(1)] as never);
        await expect(buildNextBatch(SCOPE, 10)).resolves.toEqual({
            status: 'below-threshold',
            available: 1,
            minimum: 10,
        });
        expect(tx.battleBatch.create).not.toHaveBeenCalled();
    });
});

describe('never anchoring around a missing receipt', () => {
    it('stops at the gap instead of skipping it', async () => {
        // Receipt 3 has not been published yet. Batching 1,2,4 would anchor a root that
        // looks complete while omitting a battle.
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([row(1), row(2), row(4)] as never);

        const outcome = await buildNextBatch(SCOPE);

        expect(outcome).toMatchObject({ status: 'batched', receiptCount: 2 });
        const created = tx.battleBatch.create.mock.calls[0]![0] as { data: Record<string, unknown> };
        expect(created.data.lastSequence).toBe(2n);
    });

    it('waits when the very next receipt the chain expects is missing', async () => {
        // The registry enforces firstSequence == previous.lastSequence + 1, so publishing a
        // batch that starts later would revert. Waiting is the correct move.
        vi.mocked(prisma.battleBatch.findFirst).mockResolvedValue({
            batchNumber: 1n,
            lastSequence: 10n,
            merkleRoot: `0x${'99'.repeat(32)}`,
        } as never);
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([row(12), row(13)] as never);

        await expect(buildNextBatch(SCOPE)).resolves.toEqual({ status: 'nothing-to-batch' });
        expect(tx.battleBatch.create).not.toHaveBeenCalled();
    });

    it('only considers receipts whose battle actually reached published', async () => {
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([row(1)] as never);
        await buildNextBatch(SCOPE);

        const query = vi.mocked(prisma.battleReceipt.findMany).mock.calls[0]![0] as {
            where: { batchId: null; battle: { state: string } };
        };
        expect(query.where.batchId).toBeNull();
        expect(query.where.battle.state).toBe('published');
    });
});

describe('recording the batch', () => {
    it('marks receipts and their battles in one transaction with the batch row', async () => {
        // A batch whose receipts were not marked, or marked receipts with no batch, both
        // end at a receipt anchored twice or never.
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([row(1), row(2)] as never);

        await buildNextBatch(SCOPE);

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(tx.battleReceipt.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: { batchId: 'batch_1' } }),
        );
        expect(tx.battleLedger.updateMany).toHaveBeenCalledTimes(2);
    });

    it('guards the ledger update on the battle still being published', async () => {
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([row(1)] as never);
        await buildNextBatch(SCOPE);

        const update = tx.battleLedger.updateMany.mock.calls[0]![0] as { where: { state: string } };
        expect(update.where.state).toBe('published');
    });
});

describe('inclusion proofs', () => {
    it('returns null for a receipt that has not been batched yet', async () => {
        // Normal and temporary, not an error: an unbatched receipt past the inclusion SLO
        // is operator failure, but one batched a minute from now is just waiting.
        vi.mocked(prisma.battleReceipt.findUnique).mockResolvedValue({ receiptHash: '0xabc', batchId: null } as never);
        await expect(getInclusionProof('0xabc')).resolves.toBeNull();
    });

    it('returns null for an unknown receipt', async () => {
        vi.mocked(prisma.battleReceipt.findUnique).mockResolvedValue(null);
        await expect(getInclusionProof('0xabc')).resolves.toBeNull();
    });

    it('rebuilds a proof that verifies against the recorded root', async () => {
        const receipts = [row(1), row(2), row(3), row(4), row(5)];
        const expected = buildBatch(
            receipts.map((r) => ({ receiptHash: r.receiptHash, sequence: r.sequence, rulesetHash: RULESET })),
        );
        vi.mocked(prisma.battleReceipt.findUnique).mockResolvedValue({
            receiptHash: receipts[2]!.receiptHash,
            batchId: 'batch_1',
        } as never);
        vi.mocked(prisma.battleBatch.findUnique).mockResolvedValue({
            batchNumber: 1n,
            merkleRoot: expected.merkleRoot,
            receipts,
        } as never);

        const proof = await getInclusionProof(receipts[2]!.receiptHash);

        expect(proof?.merkleRoot).toBe(expected.merkleRoot);
        expect(proof?.proof).toEqual(expected.proofFor(receipts[2]!.receiptHash));
        expect(proof?.batchNumber).toBe('1');
    });

    it('refuses to serve a proof when the batch no longer rebuilds to its recorded root', async () => {
        // Membership changed after anchoring. Serving a proof against the recomputed root
        // would hide that; refusing surfaces it.
        vi.mocked(prisma.battleReceipt.findUnique).mockResolvedValue({
            receiptHash: row(1).receiptHash,
            batchId: 'batch_1',
        } as never);
        vi.mocked(prisma.battleBatch.findUnique).mockResolvedValue({
            batchNumber: 1n,
            merkleRoot: `0x${'de'.repeat(32)}`,
            receipts: [row(1), row(2)],
        } as never);

        await expect(getInclusionProof(row(1).receiptHash)).rejects.toThrow(/rebuilds to .* but was recorded as/);
    });
});
