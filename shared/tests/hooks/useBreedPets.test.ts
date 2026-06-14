// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const breedPets = {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    lifecycle: { phase: 'idle', hash: undefined as string | undefined, error: null as Error | null, reset: vi.fn() },
};
const adapter = { kind: 'solana' as 'solana' | 'evm', breedPets };

vi.mock('../../src/hooks/adapters/useChainAdapter', () => ({ useChainAdapter: () => adapter }));
vi.mock('wagmi', () => ({
    useAccount: () => ({ address: undefined }),
    useWaitForTransactionReceipt: () => ({ data: undefined }),
}));
vi.mock('../../src/hooks/chains/ethereum/useWatchPetsContract', () => ({ useWatchPetsContract: vi.fn() }));
vi.mock('../../src/contexts/PetsConfigContext', () => ({ usePetsConfig: () => ({ evm: undefined }) }));

import { useBreedPets } from '../../src/hooks/useBreedPets';

beforeEach(() => {
    vi.clearAllMocks();
    adapter.kind = 'solana';
    breedPets.isPending = false;
    breedPets.lifecycle.error = null;
});

describe('useBreedPets', () => {
    it('breeds with a trimmed name and resolves success on Solana', async () => {
        const onSuccess = vi.fn();
        const { result } = renderHook(() => useBreedPets({ onSuccess }));

        await act(async () => {
            await result.current.mutate({ parentId1: '1', parentId2: '2', name: '  Junior  ' });
        });

        expect(breedPets.mutateAsync).toHaveBeenCalledWith({
            parentId1: '1',
            parentId2: '2',
            name: 'Junior',
        });
        expect(onSuccess).toHaveBeenCalledWith({ name: 'Junior' });
        expect(result.current.isAwaitingFulfillment).toBe(false);
    });

    it('does not resolve success immediately on EVM (event-driven)', async () => {
        adapter.kind = 'evm';
        const onSuccess = vi.fn();
        const { result } = renderHook(() => useBreedPets({ onSuccess }));

        await act(async () => {
            await result.current.mutate({ parentId1: '1', parentId2: '2', name: 'Junior' });
        });

        expect(breedPets.mutateAsync).toHaveBeenCalled();
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('swallows mutation errors', async () => {
        breedPets.mutateAsync.mockRejectedValueOnce(new Error('boom'));
        const { result } = renderHook(() => useBreedPets());

        await act(async () => {
            await expect(
                result.current.mutate({ parentId1: '1', parentId2: '2', name: 'X' }),
            ).resolves.toBeUndefined();
        });
    });

    it('reset and clearErrors reset the lifecycle', () => {
        const { result } = renderHook(() => useBreedPets());

        act(() => {
            result.current.reset();
            result.current.clearErrors();
        });

        expect(breedPets.lifecycle.reset).toHaveBeenCalledTimes(2);
    });

    it('reflects lifecycle state', () => {
        breedPets.isPending = true;
        breedPets.lifecycle.phase = 'confirming';
        breedPets.lifecycle.error = new Error('x');

        const { result } = renderHook(() => useBreedPets());
        expect(result.current.isPending).toBe(true);
        expect(result.current.isConfirming).toBe(true);
        expect(result.current.error?.message).toBe('x');
    });
});
