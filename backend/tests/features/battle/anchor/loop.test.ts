import nacl from 'tweetnacl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The batch-and-anchor loop's scheduling, as distinct from `anchor.service`'s publishing
 * logic (covered in `anchor.service.test.ts`).
 *
 * What matters here is which chains get serviced. A deployment serving several chain ids
 * used to batch only the first, which left every other chain's receipts at `published`
 * forever: never batched, so never anchored, so never eligible for a season.
 */

const battle = {
    enabled: true,
    deploymentId: 'test-deployment',
    chainIds: ['eip155:84532', 'solana:devnet'] as string[],
    anchors: {} as Record<string, unknown>,
    anchorIntervalMs: 1000,
};

vi.mock('@config/env', () => ({ env: { get battle() { return battle; } } }));

const buildNextBatch = vi.fn();
vi.mock('@features/battle/batcher', () => ({ buildNextBatch: (...args: unknown[]) => buildNextBatch(...args) }));

const anchorNextBatch = vi.fn();
vi.mock('@features/battle/anchor/anchor.service', () => ({
    anchorNextBatch: (...args: unknown[]) => anchorNextBatch(...args),
}));

import { runOnce, startBatchAnchor, stopBatchAnchor } from '@features/battle/anchor';

const EVM = 'eip155:84532';
const SOLANA = 'solana:devnet';

const evmAnchorConfig = {
    kind: 'evm' as const,
    rpcUrl: 'http://127.0.0.1:8545',
    privateKey: `0x${'11'.repeat(32)}` as `0x${string}`,
    registryAddress: '0x2222222222222222222222222222222222222222',
    evmChainId: 84532,
};

const solanaAnchorConfig = {
    kind: 'solana' as const,
    rpcUrl: 'http://127.0.0.1:8899',
    // 64-byte ed25519 secret as a JSON array, the shape solana-keygen writes.
    privateKey: JSON.stringify(Array.from(anchorTestKeypair())),
    registryAddress: '11111111111111111111111111111111',
};

/** A deterministic 64-byte secret key, so the fixture never depends on randomness. */
function anchorTestKeypair(): Uint8Array {
    const seed = new Uint8Array(32).fill(7);
    return nacl.sign.keyPair.fromSeed(seed).secretKey;
}

function scope(chainId: string) {
    return { chainId, deploymentId: 'test-deployment' };
}

beforeEach(() => {
    vi.clearAllMocks();
    battle.enabled = true;
    battle.chainIds = [EVM, SOLANA];
    battle.anchors = {};
    buildNextBatch.mockResolvedValue({ status: 'nothing-to-batch' });
    anchorNextBatch.mockResolvedValue({ status: 'nothing-to-anchor' });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    stopBatchAnchor();
    vi.restoreAllMocks();
});

describe('one pass', () => {
    it('batches the scope it was given', async () => {
        await runOnce(scope(SOLANA));
        expect(buildNextBatch).toHaveBeenCalledWith(scope(SOLANA));
    });

    it('skips anchoring, not batching, for a chain with no registry', async () => {
        await runOnce(scope(SOLANA));
        expect(buildNextBatch).toHaveBeenCalledTimes(1);
        expect(anchorNextBatch).not.toHaveBeenCalled();
    });

    it('anchors when a context is supplied', async () => {
        const anchor = { chainId: EVM, deploymentId: 'test-deployment' } as never;
        await runOnce(scope(EVM), anchor);
        expect(anchorNextBatch).toHaveBeenCalledWith(anchor);
    });

    // The two halves are independent jobs sharing a tick: a batching failure must not cost
    // the anchoring of batches already built on an earlier one.
    it('still anchors when batching throws', async () => {
        buildNextBatch.mockRejectedValue(new Error('database unreachable'));
        await runOnce(scope(EVM), { chainId: EVM } as never);
        expect(anchorNextBatch).toHaveBeenCalledTimes(1);
    });

    it('reports a failing anchor without throwing', async () => {
        anchorNextBatch.mockRejectedValue(new Error('rpc unreachable'));
        await expect(runOnce(scope(EVM), { chainId: EVM } as never)).resolves.toBeUndefined();
    });
});

describe('scheduling', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    /** The regression: two configured chains, both batched, not just `chainIds[0]`. */
    it('batches every configured chain id', async () => {
        startBatchAnchor();
        await vi.advanceTimersByTimeAsync(battle.anchorIntervalMs);

        const batched = buildNextBatch.mock.calls.map(([s]) => (s as { chainId: string }).chainId);
        expect(batched).toEqual(expect.arrayContaining([EVM, SOLANA]));
    });

    it('anchors only the chains that have a registry', async () => {
        battle.anchors = { [EVM]: evmAnchorConfig };
        startBatchAnchor();
        await vi.advanceTimersByTimeAsync(battle.anchorIntervalMs);

        expect(buildNextBatch).toHaveBeenCalledTimes(2);
        expect(anchorNextBatch).toHaveBeenCalledTimes(1);
        expect(anchorNextBatch.mock.calls[0]?.[0]).toMatchObject({ chainId: EVM });
    });

    // A Solana chain id gets the Solana client, not a viem one pointed at a Solana RPC. The
    // config's `kind` decides, and env derives it from the chain id's namespace, so the
    // mismatch this used to guard against is now unrepresentable.
    it('anchors a Solana chain id through its own client', async () => {
        battle.anchors = { [SOLANA]: solanaAnchorConfig };
        startBatchAnchor();
        await vi.advanceTimersByTimeAsync(battle.anchorIntervalMs);

        expect(buildNextBatch).toHaveBeenCalledTimes(2);
        expect(anchorNextBatch).toHaveBeenCalledTimes(1);
        expect(anchorNextBatch.mock.calls[0]?.[0]).toMatchObject({ chainId: SOLANA });
    });

    it('anchors both families at once when both are configured', async () => {
        battle.anchors = { [EVM]: evmAnchorConfig, [SOLANA]: solanaAnchorConfig };
        startBatchAnchor();
        await vi.advanceTimersByTimeAsync(battle.anchorIntervalMs);

        const anchored = anchorNextBatch.mock.calls.map(([c]) => (c as { chainId: string }).chainId);
        expect(anchored).toEqual(expect.arrayContaining([EVM, SOLANA]));
    });

    it('keeps batching one chain when another chain throws', async () => {
        buildNextBatch.mockImplementation((s: { chainId: string }) =>
            s.chainId === EVM ? Promise.reject(new Error('rpc unreachable')) : Promise.resolve({ status: 'nothing-to-batch' }),
        );
        startBatchAnchor();
        await vi.advanceTimersByTimeAsync(battle.anchorIntervalMs * 2);

        const solanaPasses = buildNextBatch.mock.calls.filter(([s]) => (s as { chainId: string }).chainId === SOLANA);
        expect(solanaPasses).toHaveLength(2);
    });

    it('starts nothing when backend battle mode is off', async () => {
        battle.enabled = false;
        startBatchAnchor();
        await vi.advanceTimersByTimeAsync(battle.anchorIntervalMs);
        expect(buildNextBatch).not.toHaveBeenCalled();
    });

    it('stops every chain timer', async () => {
        startBatchAnchor();
        await vi.advanceTimersByTimeAsync(battle.anchorIntervalMs);
        stopBatchAnchor();
        buildNextBatch.mockClear();

        await vi.advanceTimersByTimeAsync(battle.anchorIntervalMs * 3);
        expect(buildNextBatch).not.toHaveBeenCalled();
    });
});
