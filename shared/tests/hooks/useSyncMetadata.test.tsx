// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------- stubs ----------
const syncMetadata = {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    error: null as Error | null,
};
const actions = { syncMetadata };

let activeKind: string = 'solana';

vi.mock('../../src/hooks/session/useChainCapabilities', () => ({
    useChainCapabilities: () => ({ activeKind }),
}));
vi.mock('../../src/hooks/chains/solana/usePetActions', () => ({
    usePetActions: () => actions,
}));

const testPets = [
    { id: '5', assetKey: 'asset-key-5', name: 'LeveledUp' },
    { id: '7', assetKey: undefined, name: 'NoKey' },
];
vi.mock('../../src/hooks/pets/usePetList', () => ({
    usePetList: () => ({ pets: testPets }),
}));

import { useSyncMetadata } from '../../src/hooks/pets/useSyncMetadata';

beforeEach(() => {
    vi.clearAllMocks();
    activeKind = 'solana';
    syncMetadata.mutateAsync.mockResolvedValue(undefined);
    syncMetadata.isPending = false;
    syncMetadata.error = null;
});

describe('useSyncMetadata', () => {
    it('calls syncMetadata.mutateAsync with assetKey on Solana', async () => {
        const { result } = renderHook(() => useSyncMetadata());
        await act(async () => { await result.current.sync('5'); });
        expect(syncMetadata.mutateAsync).toHaveBeenCalledWith({ assetKey: 'asset-key-5' });
    });

    it('is a no-op on EVM chain', async () => {
        activeKind = 'evm';
        const { result } = renderHook(() => useSyncMetadata());
        await act(async () => { await result.current.sync('5'); });
        expect(syncMetadata.mutateAsync).not.toHaveBeenCalled();
    });

    it('throws when assetKey is not found', async () => {
        const { result } = renderHook(() => useSyncMetadata());
        await expect(
            act(async () => { await result.current.sync('7'); })
        ).rejects.toThrow(/asset key not found/i);
    });

    it('throws when petId is unknown', async () => {
        const { result } = renderHook(() => useSyncMetadata());
        await expect(
            act(async () => { await result.current.sync('999'); })
        ).rejects.toThrow(/asset key not found/i);
    });

    it('reflects isPending from actions', () => {
        syncMetadata.isPending = true;
        const { result } = renderHook(() => useSyncMetadata());
        expect(result.current.isPending).toBe(true);
    });

    it('reflects error from actions', () => {
        syncMetadata.error = new Error('sync failed');
        const { result } = renderHook(() => useSyncMetadata());
        expect(result.current.error?.message).toBe('sync failed');
    });
});
