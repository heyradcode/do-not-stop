import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createEvmAnchorClient, PUBLISH_BATCH_GAS_LIMIT, ZERO_ROOT } from '@features/battle/anchor';

/**
 * The EVM half of anchoring: the contract calls `anchor.service` no longer knows about.
 *
 * Worth its own suite because the refactor to `BatchAnchorClient` moved two decisions down
 * here, and both are the kind that fail silently. A reverted publish must throw rather than
 * return a hash, and the head root must come back normalized, since the service compares it
 * against a root it stored.
 */

const REGISTRY = '0x1111111111111111111111111111111111111111' as const;
const ROOT_1 = `0x${'11'.repeat(32)}` as const;
const RULESET_SET = `0x${'aa'.repeat(32)}` as const;
const TX_HASH = `0x${'ee'.repeat(32)}` as const;

const readContract = vi.fn();
const writeContract = vi.fn();
const waitForTransactionReceipt = vi.fn();

function client() {
    return createEvmAnchorClient(
        {
            publicClient: { readContract, waitForTransactionReceipt } as never,
            walletClient: { writeContract } as never,
        },
        REGISTRY,
    );
}

function onChain(latestBatchNumber: unknown, latestRoot: unknown) {
    readContract.mockImplementation(({ functionName }: { functionName: string }) =>
        Promise.resolve(functionName === 'latestBatchNumber' ? latestBatchNumber : latestRoot),
    );
}

const commitment = {
    batchNumber: 1n,
    previousRoot: ZERO_ROOT,
    merkleRoot: ROOT_1,
    rulesetSetHash: RULESET_SET,
    firstSequence: 1n,
    lastSequence: 100n,
};

beforeEach(() => {
    vi.clearAllMocks();
    writeContract.mockResolvedValue(TX_HASH);
    waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
});

describe('reading the head', () => {
    it('reads both head fields from the registry', async () => {
        onChain(3n, ROOT_1);

        await expect(client().readHead()).resolves.toEqual({ batchNumber: 3n, root: ROOT_1 });
        expect(readContract).toHaveBeenCalledTimes(2);
    });

    // viem can hand back a checksummed or upper-case hex string depending on the node. The
    // service compares this against a root it stored itself, so an un-normalized value would
    // read as "our link disagrees with the chain" on a chain that agrees perfectly.
    it('lowercases the root so the comparison upstream is meaningful', async () => {
        onChain(1n, ROOT_1.toUpperCase().replace('0X', '0x'));

        const head = await client().readHead();

        expect(head.root).toBe(ROOT_1);
    });

    it('coerces the batch number to a bigint', async () => {
        // uint64 comes back as a bigint from viem, but a mocked or older node may return a
        // number; the service does bigint arithmetic on it either way.
        onChain(2, ROOT_1);

        const head = await client().readHead();

        expect(head.batchNumber).toBe(2n);
    });
});

describe('publishing a batch', () => {
    it('sends publishBatch with the commitment in order, under the gas ceiling', async () => {
        await client().publishBatch(commitment);

        const call = writeContract.mock.calls[0]![0] as {
            address: string;
            functionName: string;
            args: unknown[];
            gas: bigint;
        };
        expect(call.address).toBe(REGISTRY);
        expect(call.functionName).toBe('publishBatch');
        expect(call.args).toEqual([1n, ZERO_ROOT, ROOT_1, RULESET_SET, 1n, 100n]);
        expect(call.gas).toBe(PUBLISH_BATCH_GAS_LIMIT);
    });

    it('returns the hash once the transaction succeeds', async () => {
        await expect(client().publishBatch(commitment)).resolves.toEqual({ txHash: TX_HASH });
    });

    it('waits for the receipt rather than returning on send', async () => {
        await client().publishBatch(commitment);

        expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: TX_HASH });
    });

    // The one that matters. Returning a hash here would mark the batch anchored against a
    // transaction that anchored nothing, and the next pass would move on to the next batch.
    it('throws when the transaction lands and reverts', async () => {
        waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' });

        await expect(client().publishBatch(commitment)).rejects.toThrow(/reverted/);
    });

    it('names the batch and the transaction in the revert message', async () => {
        waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' });

        await expect(client().publishBatch(commitment)).rejects.toThrow(TX_HASH);
    });

    it('propagates a send failure untouched', async () => {
        writeContract.mockRejectedValue(new Error('insufficient funds'));

        await expect(client().publishBatch(commitment)).rejects.toThrow('insufficient funds');
    });
});
