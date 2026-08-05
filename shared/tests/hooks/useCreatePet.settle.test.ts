// @vitest-environment jsdom
/**
 * The EVM settle half of useCreatePet, which petMutationHooks.test.tsx does not
 * reach: that file mocks useWatchEntropyFulfillment to a no-op, so nothing there
 * drives a reveal. Same shape as useBreedPets.settle.test.ts, and deliberately so:
 * the two hooks run the same request/reveal/settle flow, and these tests are what
 * makes it safe to lift that flow into one place.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const h = vi.hoisted(() => ({
    writeContract: vi.fn(),
    settleReset: vi.fn(),
    onFulfilled: undefined as ((id: bigint) => void) | undefined,
}));

const createPet = {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    lifecycle: { phase: 'idle', hash: undefined as string | undefined, error: null as Error | null, reset: vi.fn() },
};
const adapter = { kind: 'evm' as 'evm' | 'solana', createPet };

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
vi.mock('viem', () => ({ parseEventLogs: () => [] }));
vi.mock('../../src/hooks/chains/ethereum/usePolledContractEvent', () => ({ usePolledContractEvent: vi.fn() }));
vi.mock('../../src/hooks/tx/useTxSuccess', () => ({ useTxSuccess: vi.fn() }));
vi.mock('../../src/hooks/chains/ethereum/useWatchEntropyFulfillment', () => ({
    useWatchEntropyFulfillment: (opts: { onFulfilled: (id: bigint) => void }) => {
        h.onFulfilled = opts.onFulfilled;
    },
}));
vi.mock('../../src/contexts/PetsConfigContext', () => ({
    usePetsConfig: () => ({
        evm: { gameLogic: { address: '0x00000000000000000000000000000000000000bb', abi: [] }, chainId: 1 },
    }),
}));

import { useCreatePet } from '../../src/hooks/pets/useCreatePet';

beforeEach(() => {
    vi.clearAllMocks();
    h.onFulfilled = undefined;
    adapter.kind = 'evm';
});

describe('useCreatePet EVM settle', () => {
    it('sends settleMint when entropy reveals', () => {
        renderHook(() => useCreatePet());

        act(() => h.onFulfilled?.(7n));

        expect(h.writeContract).toHaveBeenCalledTimes(1);
        expect(h.writeContract.mock.calls[0]?.[0]).toMatchObject({
            functionName: 'settleMint',
            args: [7n],
        });
    });

    it('sends only one settle when the same reveal arrives twice', () => {
        renderHook(() => useCreatePet());

        act(() => h.onFulfilled?.(7n));
        act(() => h.onFulfilled?.(7n));

        expect(h.writeContract).toHaveBeenCalledTimes(1);
    });

    it('re-arms after a failed settle so the mint can still be finished', () => {
        renderHook(() => useCreatePet());

        act(() => h.onFulfilled?.(7n));
        const onError = h.writeContract.mock.calls[0]?.[1]?.onError as ((e: Error) => void) | undefined;
        expect(onError, 'settleMint must pass an onError handler').toBeTypeOf('function');

        act(() => onError!(new Error('user rejected')));
        act(() => h.onFulfilled?.(7n));

        expect(h.writeContract).toHaveBeenCalledTimes(2);
    });
});
