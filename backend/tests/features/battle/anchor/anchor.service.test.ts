import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/prisma', () => ({
    prisma: { battleBatch: { findFirst: vi.fn(), update: vi.fn() } },
}));

import { prisma } from '@config/prisma';
import { anchorNextBatch, ZERO_ROOT, type AnchorContext } from '@features/battle/anchor';

const ROOT_1 = `0x${'11'.repeat(32)}`;
const ROOT_2 = `0x${'22'.repeat(32)}`;
const RULESET_SET = `0x${'aa'.repeat(32)}`;
const TX_HASH = `0x${'ee'.repeat(32)}`;

const readContract = vi.fn();
const writeContract = vi.fn();
const waitForTransactionReceipt = vi.fn();

function context(): AnchorContext {
    return {
        publicClient: { readContract, waitForTransactionReceipt } as never,
        walletClient: { writeContract } as never,
        registryAddress: '0x1111111111111111111111111111111111111111',
        chainId: 'eip155:84532',
        deploymentId: 'base-sepolia-live',
    };
}

/** Registry state: head batch number and head root. */
function onChain(latestBatchNumber: bigint, latestRoot: string) {
    readContract.mockImplementation(({ functionName }: { functionName: string }) =>
        Promise.resolve(functionName === 'latestBatchNumber' ? latestBatchNumber : latestRoot),
    );
}

function batch(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id: 'batch_1',
        batchNumber: 1n,
        previousRoot: null,
        merkleRoot: ROOT_1,
        rulesetSetHash: RULESET_SET,
        firstSequence: 1n,
        lastSequence: 100n,
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.battleBatch.update).mockResolvedValue({} as never);
    writeContract.mockResolvedValue(TX_HASH);
    waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
});

describe('anchoring the next batch', () => {
    it('publishes the first batch against the zero root', async () => {
        vi.mocked(prisma.battleBatch.findFirst).mockResolvedValue(batch() as never);
        onChain(0n, ZERO_ROOT);

        const outcome = await anchorNextBatch(context());

        expect(outcome).toEqual({ status: 'anchored', batchNumber: 1n, txHash: TX_HASH });
        const call = writeContract.mock.calls[0]![0] as { args: unknown[] };
        expect(call.args).toEqual([1n, ZERO_ROOT, ROOT_1, RULESET_SET, 1n, 100n]);
    });

    it('records the transaction hash against the batch', async () => {
        vi.mocked(prisma.battleBatch.findFirst).mockResolvedValue(batch() as never);
        onChain(0n, ZERO_ROOT);

        await anchorNextBatch(context());

        expect(prisma.battleBatch.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'batch_1' },
                data: expect.objectContaining({ anchoredTxHash: TX_HASH }),
            }),
        );
    });

    it('publishes a later batch linked to the registry head', async () => {
        vi.mocked(prisma.battleBatch.findFirst).mockResolvedValue(
            batch({ id: 'batch_2', batchNumber: 2n, previousRoot: ROOT_1, merkleRoot: ROOT_2 }) as never,
        );
        onChain(1n, ROOT_1);

        await expect(anchorNextBatch(context())).resolves.toMatchObject({ status: 'anchored', batchNumber: 2n });
    });

    it('takes the oldest unanchored batch, so batches anchor in order', async () => {
        vi.mocked(prisma.battleBatch.findFirst).mockResolvedValue(batch() as never);
        onChain(0n, ZERO_ROOT);

        await anchorNextBatch(context());

        const query = vi.mocked(prisma.battleBatch.findFirst).mock.calls[0]![0] as {
            where: { anchoredAt: null };
            orderBy: { batchNumber: string };
        };
        expect(query.where.anchoredAt).toBeNull();
        expect(query.orderBy.batchNumber).toBe('asc');
    });

    it('does nothing when every batch is anchored', async () => {
        vi.mocked(prisma.battleBatch.findFirst).mockResolvedValue(null);
        await expect(anchorNextBatch(context())).resolves.toEqual({ status: 'nothing-to-anchor' });
        expect(writeContract).not.toHaveBeenCalled();
    });
});

describe('crash safety', () => {
    it('reconciles a batch whose transaction landed but whose row was never updated', async () => {
        // The chain is the authority: resubmitting would revert on the batch number anyway.
        vi.mocked(prisma.battleBatch.findFirst).mockResolvedValue(batch() as never);
        onChain(1n, ROOT_1);

        const outcome = await anchorNextBatch(context());

        expect(outcome).toEqual({ status: 'already-anchored', batchNumber: 1n });
        expect(writeContract).not.toHaveBeenCalled();
        expect(prisma.battleBatch.update).toHaveBeenCalled();
    });

    it('does not invent a transaction hash when reconciling', async () => {
        // We know it landed, not in which transaction; the event log is the record.
        vi.mocked(prisma.battleBatch.findFirst).mockResolvedValue(batch() as never);
        onChain(1n, ROOT_1);

        await anchorNextBatch(context());

        const call = vi.mocked(prisma.battleBatch.update).mock.calls[0]![0] as { data: Record<string, unknown> };
        expect(call.data.anchoredAt).toBeInstanceOf(Date);
        expect('anchoredTxHash' in call.data).toBe(false);
    });
});

describe('refusing to submit a transaction that would revert', () => {
    it('reports out-of-sync when a batch is missing between the chain head and ours', async () => {
        vi.mocked(prisma.battleBatch.findFirst).mockResolvedValue(
            batch({ batchNumber: 5n, previousRoot: ROOT_1 }) as never,
        );
        onChain(1n, ROOT_1);

        const outcome = await anchorNextBatch(context());

        expect(outcome).toMatchObject({ status: 'out-of-sync' });
        expect(String((outcome as { detail: string }).detail)).toContain('expects batch 2');
        expect(writeContract).not.toHaveBeenCalled();
    });

    it('reports out-of-sync when our link disagrees with the registry head', async () => {
        // The local batch chain was built on something the registry never accepted, which
        // needs a human rather than a retry.
        vi.mocked(prisma.battleBatch.findFirst).mockResolvedValue(
            batch({ batchNumber: 2n, previousRoot: ROOT_2 }) as never,
        );
        onChain(1n, ROOT_1);

        const outcome = await anchorNextBatch(context());

        expect(outcome).toMatchObject({ status: 'out-of-sync' });
        expect(String((outcome as { detail: string }).detail)).toContain('registry head');
        expect(writeContract).not.toHaveBeenCalled();
    });

    it('reads the on-chain head before submitting rather than paying for a revert', async () => {
        vi.mocked(prisma.battleBatch.findFirst).mockResolvedValue(batch() as never);
        onChain(0n, ZERO_ROOT);

        await anchorNextBatch(context());

        expect(readContract).toHaveBeenCalledTimes(2);
    });
});

describe('failures leave the batch retryable', () => {
    it('reports a reverted transaction without marking the batch anchored', async () => {
        vi.mocked(prisma.battleBatch.findFirst).mockResolvedValue(batch() as never);
        onChain(0n, ZERO_ROOT);
        waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' });

        const outcome = await anchorNextBatch(context());

        expect(outcome).toMatchObject({ status: 'failed' });
        expect(prisma.battleBatch.update).not.toHaveBeenCalled();
    });

    it('reports a send failure without marking the batch anchored', async () => {
        // The batch is durable and its receipts are already public; only the anchor is
        // missing, so the next pass retries it.
        vi.mocked(prisma.battleBatch.findFirst).mockResolvedValue(batch() as never);
        onChain(0n, ZERO_ROOT);
        writeContract.mockRejectedValue(new Error('insufficient funds'));

        const outcome = await anchorNextBatch(context());

        expect(outcome).toMatchObject({ status: 'failed', detail: expect.stringContaining('insufficient funds') });
        expect(prisma.battleBatch.update).not.toHaveBeenCalled();
    });
});
