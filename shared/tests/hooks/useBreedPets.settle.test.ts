// @vitest-environment jsdom
/**
 * The EVM settle half of useBreedPets, which useBreedPets.test.ts does not reach:
 * that file mocks useWatchEntropyFulfillment to a no-op, so nothing there ever
 * drives a reveal. Everything below hangs off the reveal callback, so it needs its
 * own mock set.
 *
 * What makes this worth pinning: the user has already paid the breed fee and the
 * entropy fee by the time a reveal lands, and settleBreed is the only thing that
 * turns that into a pet. A settle that cannot be retried strands the request on
 * chain with the money spent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const h = vi.hoisted(() => ({
    writeContract: vi.fn(),
    settleReset: vi.fn(),
    // Captured from the entropy watcher so a test can fire a reveal by hand.
    onFulfilled: undefined as ((id: bigint) => void) | undefined,
}));

const breedPets = {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    lifecycle: { phase: 'idle', hash: undefined as string | undefined, error: null as Error | null, reset: vi.fn() },
};
const adapter = { kind: 'evm' as 'evm' | 'solana', breedPets };

vi.mock('../../src/hooks/adapters/useChainAdapter', () => ({ useChainAdapter: () => adapter }));
vi.mock('wagmi', () => ({
    useAccount: () => ({ address: '0x00000000000000000000000000000000000000aa' }),
    useReadContract: () => ({ data: '0x00000000000000000000000000000000000000ee' }),
    useWriteContract: () => ({
        writeContract: h.writeContract,
        reset: h.settleReset,
        data: undefined,
        isPending: false,
        error: null,
    }),
    useWaitForTransactionReceipt: () => ({ data: undefined, isSuccess: false }),
    useWatchContractEvent: vi.fn(),
}));
vi.mock('../../src/hooks/chains/ethereum/useWatchPetsContract', () => ({ useWatchPetsContract: vi.fn() }));
vi.mock('../../src/hooks/chains/ethereum/useWatchEntropyFulfillment', () => ({
    useWatchEntropyFulfillment: (opts: { onFulfilled: (id: bigint) => void }) => {
        h.onFulfilled = opts.onFulfilled;
    },
}));
vi.mock('../../src/contexts/PetsConfigContext', () => ({
    usePetsConfig: () => ({
        evm: {
            gameLogic: { address: '0x00000000000000000000000000000000000000gg'.replace(/g/g, 'b'), abi: [] },
            chainId: 1,
        },
    }),
}));

import { useBreedPets } from '../../src/hooks/pets/useBreedPets';

/**
 * Comfortably past `useEvmEntropySettleFlow`'s keeper grace period, which the settle now
 * waits out before asking the player. See `reveal`.
 */
const PAST_GRACE_MS = 60_000;

/**
 * Fire a reveal and let the grace period lapse, which is when the settle is actually sent.
 *
 * The settle used to go out the instant entropy revealed, racing the backend settle keeper
 * that exists precisely so the player is not asked twice. Every assertion below is about
 * what happens once nothing else has settled, so each drives the reveal through here.
 */
const reveal = (id: bigint) => {
    act(() => h.onFulfilled?.(id));
    act(() => { vi.advanceTimersByTime(PAST_GRACE_MS); });
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    h.onFulfilled = undefined;
    adapter.kind = 'evm';
});

afterEach(() => {
    vi.useRealTimers();
});

describe('useBreedPets EVM settle', () => {
    it('sends settleBreed when entropy reveals', () => {
        renderHook(() => useBreedPets());

        reveal(7n);

        expect(h.writeContract).toHaveBeenCalledTimes(1);
        expect(h.writeContract.mock.calls[0]?.[0]).toMatchObject({
            functionName: 'settleBreed',
            args: [7n],
        });
    });

    it('sends only one settle when the same reveal arrives twice', () => {
        renderHook(() => useBreedPets());

        reveal(7n);
        reveal(7n);

        expect(h.writeContract).toHaveBeenCalledTimes(1);
    });

    // The guard exists to stop one reveal sending two settles, not to make a
    // rejected or reverted settle permanent. settleBreed is permissionless and
    // retryable, and the request stays pending on chain until it lands, so a
    // wallet rejection here must not end the breed. useCreatePet already does
    // this; see the onError comment there.
    /*
     * The keeper (backend/src/features/settle-keeper/) settles this for free. Sending our
     * own the moment entropy revealed raced it, and the loser produced a wallet prompt for
     * work already done — with an explicit `gas` that skips simulation, so signing it spent
     * gas on a transaction that then reverted.
     */
    it('gives a keeper time to settle before asking the player', () => {
        renderHook(() => useBreedPets());

        act(() => h.onFulfilled?.(7n));

        expect(h.writeContract).not.toHaveBeenCalled();
    });

    it('re-arms after a failed settle so the breed can still be finished', () => {
        renderHook(() => useBreedPets());

        reveal(7n);
        const onError = h.writeContract.mock.calls[0]?.[1]?.onError as ((e: Error) => void) | undefined;
        expect(onError, 'settleBreed must pass an onError handler').toBeTypeOf('function');

        act(() => onError!(new Error('user rejected')));
        reveal(7n);

        expect(h.writeContract).toHaveBeenCalledTimes(2);
    });
});
