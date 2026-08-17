// @vitest-environment jsdom
/**
 * The keeper grace period, tested against the flow hook itself.
 *
 * `useBreedPets.settle.test.ts` and `useCreatePet.settle.test.ts` cover their own callers,
 * but neither can drive `pendingRequestId` from set back to null — the signal that somebody
 * else settled — because both mock the request receipt away. That transition is the whole
 * point of the grace period, so it is exercised here where the receipt can be faked.
 *
 * Why any of this exists: settling is permissionless, and
 * `backend/src/features/settle-keeper/` sends it so the player is not asked for a second
 * signature. Sending ours the instant entropy revealed raced that keeper. Losing produced a
 * wallet prompt for work already done, and because the settle carries an explicit `gas` —
 * which skips simulation — signing it spent gas on a transaction that then reverted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const h = vi.hoisted(() => ({
    writeContract: vi.fn(),
    reset: vi.fn(),
    onFulfilled: undefined as ((id: bigint) => void) | undefined,
    /** The request tx receipt; a block number is all the flow reads off it here. */
    requestReceipt: undefined as { blockNumber: bigint; logs: unknown[] } | undefined,
    /** What `parseEventLogs` yields — the request event carrying (owner, requestId). */
    parsedLogs: [] as { args: { owner?: string; requestId?: bigint } }[],
}));

const OWNER = '0x00000000000000000000000000000000000000aa';

vi.mock('wagmi', () => ({
    useAccount: () => ({ address: OWNER }),
    useReadContract: () => ({ data: '0x00000000000000000000000000000000000000ee' }),
    useWriteContract: () => ({
        writeContract: h.writeContract,
        reset: h.reset,
        data: undefined,
        isPending: false,
        error: null,
    }),
    // Serves the request receipt; the settle receipt is never reached in these cases.
    useWaitForTransactionReceipt: ({ hash }: { hash?: string }) => ({
        data: hash ? h.requestReceipt : undefined,
        isSuccess: false,
    }),
}));

vi.mock('viem', () => ({ parseEventLogs: () => h.parsedLogs }));

vi.mock('../../src/hooks/chains/ethereum/useWatchEntropyFulfillment', () => ({
    useWatchEntropyFulfillment: (opts: { onFulfilled: (id: bigint) => void }) => {
        h.onFulfilled = opts.onFulfilled;
    },
}));

vi.mock('../../src/contexts/PetsConfigContext', () => ({
    usePetsConfig: () => ({
        evm: {
            gameLogic: { address: '0x00000000000000000000000000000000000000bb', abi: [] },
            chainId: 1,
        },
    }),
}));

import { useEvmEntropySettleFlow } from '../../src/hooks/chains/ethereum/useEvmEntropySettleFlow';

const GRACE_MS = 15_000;

const options = (overrides: Record<string, unknown> = {}) => ({
    enabled: true,
    requestHash: '0xrequest',
    requestEventName: 'BreedRandomnessRequested',
    settleFunctionName: 'settleBreed',
    settleGas: 800_000n,
    label: 'settleBreed',
    ...overrides,
});

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    h.onFulfilled = undefined;
    h.requestReceipt = { blockNumber: 100n, logs: [] };
    h.parsedLogs = [{ args: { owner: OWNER, requestId: 7n } }];
});

afterEach(() => {
    vi.useRealTimers();
});

describe('useEvmEntropySettleFlow', () => {
    it('picks our request id out of the request receipt', () => {
        const { result } = renderHook(() => useEvmEntropySettleFlow(options()));
        expect(result.current.pendingRequestId).toBe(7n);
    });

    it('ignores another player request in the same block', () => {
        h.parsedLogs = [{ args: { owner: '0x00000000000000000000000000000000000000cc', requestId: 9n } }];
        const { result } = renderHook(() => useEvmEntropySettleFlow(options()));
        expect(result.current.pendingRequestId).toBeNull();
    });

    describe('the keeper grace period', () => {
        it('does not prompt the moment entropy reveals', () => {
            renderHook(() => useEvmEntropySettleFlow(options()));

            act(() => h.onFulfilled?.(7n));

            expect(h.writeContract).not.toHaveBeenCalled();
        });

        it('settles once the grace period lapses with nobody else having done it', () => {
            renderHook(() => useEvmEntropySettleFlow(options()));

            act(() => h.onFulfilled?.(7n));
            act(() => { vi.advanceTimersByTime(GRACE_MS); });

            expect(h.writeContract).toHaveBeenCalledTimes(1);
            expect(h.writeContract.mock.calls[0]?.[0]).toMatchObject({
                functionName: 'settleBreed',
                args: [7n],
            });
        });

        /*
         * The case this was written for. The caller clears the pending request when it sees
         * the settled event, which is how the flow learns the keeper won.
         */
        it('never prompts when the request is settled elsewhere first', () => {
            const { result } = renderHook(() => useEvmEntropySettleFlow(options()));

            act(() => h.onFulfilled?.(7n));
            act(() => result.current.clearPending());
            act(() => { vi.advanceTimersByTime(GRACE_MS * 4); });

            expect(h.writeContract).not.toHaveBeenCalled();
        });

        it('queues one settle however many times the same reveal arrives', () => {
            renderHook(() => useEvmEntropySettleFlow(options()));

            act(() => h.onFulfilled?.(7n));
            act(() => h.onFulfilled?.(7n));
            act(() => h.onFulfilled?.(7n));
            act(() => { vi.advanceTimersByTime(GRACE_MS); });

            expect(h.writeContract).toHaveBeenCalledTimes(1);
        });

        // A local stack with KEEPER_ENABLED off has nothing to wait for.
        it('settles immediately when the grace period is zero', () => {
            renderHook(() => useEvmEntropySettleFlow(options({ settleGraceMs: 0 })));

            act(() => h.onFulfilled?.(7n));

            expect(h.writeContract).toHaveBeenCalledTimes(1);
        });

        it('drops a queued settle on reset, so an abandoned flow cannot prompt later', () => {
            const { result } = renderHook(() => useEvmEntropySettleFlow(options()));

            act(() => h.onFulfilled?.(7n));
            act(() => result.current.reset());
            act(() => { vi.advanceTimersByTime(GRACE_MS * 4); });

            expect(h.writeContract).not.toHaveBeenCalled();
        });

        it('drops a queued settle on unmount', () => {
            const { unmount } = renderHook(() => useEvmEntropySettleFlow(options()));

            act(() => h.onFulfilled?.(7n));
            unmount();
            act(() => { vi.advanceTimersByTime(GRACE_MS * 4); });

            expect(h.writeContract).not.toHaveBeenCalled();
        });
    });
});
