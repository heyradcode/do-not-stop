// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------- stubs ----------
const setOpenToChallenges = {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    error: null as Error | null,
};
const actions = { setOpenToChallenges };

let activeKind: string = 'solana';

vi.mock('../../src/hooks/useChainCapabilities', () => ({
    useChainCapabilities: () => ({ activeKind }),
}));
vi.mock('../../src/hooks/chains/solana/usePetActions', () => ({
    usePetActions: () => actions,
}));

const testPets = [
    { id: '1', assetKey: 'asset-key-1', name: 'Alpha' },
    { id: '2', assetKey: undefined, name: 'NoKey' },
];
vi.mock('../../src/hooks/usePetList', () => ({
    usePetList: () => ({ pets: testPets }),
}));

import { useSetOpenToChallenges } from '../../src/hooks/useSetOpenToChallenges';

beforeEach(() => {
    vi.clearAllMocks();
    activeKind = 'solana';
    setOpenToChallenges.mutateAsync.mockResolvedValue(undefined);
    setOpenToChallenges.isPending = false;
    setOpenToChallenges.error = null;
});

describe('useSetOpenToChallenges', () => {
    it('calls setOpenToChallenges.mutateAsync with inverted value on Solana', async () => {
        const { result } = renderHook(() => useSetOpenToChallenges());
        await act(async () => { await result.current.toggle('1', false); });
        expect(setOpenToChallenges.mutateAsync).toHaveBeenCalledWith({
            petId: 1,
            assetKey: 'asset-key-1',
            value: true,
        });
    });

    it('inverts currentValue=true to false', async () => {
        const { result } = renderHook(() => useSetOpenToChallenges());
        await act(async () => { await result.current.toggle('1', true); });
        expect(setOpenToChallenges.mutateAsync).toHaveBeenCalledWith({
            petId: 1,
            assetKey: 'asset-key-1',
            value: false,
        });
    });

    it('is a no-op on EVM chain', async () => {
        activeKind = 'evm';
        const { result } = renderHook(() => useSetOpenToChallenges());
        await act(async () => { await result.current.toggle('1', false); });
        expect(setOpenToChallenges.mutateAsync).not.toHaveBeenCalled();
    });

    it('throws when assetKey is not found', async () => {
        const { result } = renderHook(() => useSetOpenToChallenges());
        await expect(
            act(async () => { await result.current.toggle('2', false); })
        ).rejects.toThrow(/asset key not found/i);
    });

    it('throws when petId is unknown', async () => {
        const { result } = renderHook(() => useSetOpenToChallenges());
        await expect(
            act(async () => { await result.current.toggle('999', false); })
        ).rejects.toThrow(/asset key not found/i);
    });

    it('reflects isPending from actions', () => {
        setOpenToChallenges.isPending = true;
        const { result } = renderHook(() => useSetOpenToChallenges());
        expect(result.current.isPending).toBe(true);
    });

    it('reflects error from actions', () => {
        setOpenToChallenges.error = new Error('tx failed');
        const { result } = renderHook(() => useSetOpenToChallenges());
        expect(result.current.error?.message).toBe('tx failed');
    });
});
