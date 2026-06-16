// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// ---------- shared adapter stub ----------
const makeAction = () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    lifecycle: { phase: 'idle', hash: undefined as string | undefined, error: null as Error | null, reset: vi.fn() },
});

const adapter = {
    createPet: makeAction(),
    levelUpPet: makeAction(),
    renamePet: makeAction(),
    transferPet: makeAction(),
    trainPet: makeAction(),
};

vi.mock('../../src/hooks/adapters/useChainAdapter', () => ({ useChainAdapter: () => adapter }));

let txSuccessRegistry: Array<[unknown, (() => void) | undefined]> = [];
vi.mock('../../src/hooks/useTxSuccess', () => ({
    useTxSuccess: (lifecycle: unknown, cb: (() => void) | undefined) => {
        txSuccessRegistry.push([lifecycle, cb]);
    },
}));

import { useCreatePet } from '../../src/hooks/useCreatePet';
import { useLevelUpPet } from '../../src/hooks/useLevelUpPet';
import { useRenamePet } from '../../src/hooks/useRenamePet';
import { useTransferPet } from '../../src/hooks/useTransferPet';
import { useTrainPet } from '../../src/hooks/useTrainPet';

beforeEach(() => {
    vi.clearAllMocks();
    txSuccessRegistry = [];
    for (const a of Object.values(adapter)) {
        a.mutateAsync.mockResolvedValue(undefined);
        a.isPending = false;
        a.lifecycle.phase = 'idle';
        a.lifecycle.hash = undefined;
        a.lifecycle.error = null;
    }
});

// ---------- useCreatePet ----------
describe('useCreatePet', () => {
    it('delegates mutate to adapter with name/dna/rarity', async () => {
        const { result } = renderHook(() => useCreatePet());
        await act(async () => {
            await result.current.mutate({ name: 'Fluffy', dna: 42n, rarity: 3 });
        });
        expect(adapter.createPet.mutateAsync).toHaveBeenCalledWith({ name: 'Fluffy', dna: 42n, rarity: 3 });
    });

    it('reflects lifecycle state', () => {
        adapter.createPet.isPending = true;
        adapter.createPet.lifecycle.error = new Error('mint fail');
        adapter.createPet.lifecycle.hash = '0xabc';
        const { result } = renderHook(() => useCreatePet());
        expect(result.current.isPending).toBe(true);
        expect(result.current.error?.message).toBe('mint fail');
        expect(result.current.hash).toBe('0xabc');
    });

    it('reset delegates to lifecycle.reset', () => {
        const { result } = renderHook(() => useCreatePet());
        act(() => { result.current.reset(); });
        expect(adapter.createPet.lifecycle.reset).toHaveBeenCalledOnce();
    });

    it('wires onSuccess via useTxSuccess', () => {
        const onSuccess = vi.fn();
        renderHook(() => useCreatePet({ onSuccess }));
        const entry = txSuccessRegistry.find(([lc]) => lc === adapter.createPet.lifecycle);
        expect(entry?.[1]).toBe(onSuccess);
    });
});

// ---------- useLevelUpPet ----------
describe('useLevelUpPet', () => {
    it('delegates mutate with petId', async () => {
        const { result } = renderHook(() => useLevelUpPet());
        await act(async () => { await result.current.mutate({ petId: '7' }); });
        expect(adapter.levelUpPet.mutateAsync).toHaveBeenCalledWith({ petId: '7' });
    });

    it('reflects pending state', () => {
        adapter.levelUpPet.isPending = true;
        const { result } = renderHook(() => useLevelUpPet());
        expect(result.current.isPending).toBe(true);
    });
});

// ---------- useRenamePet ----------
describe('useRenamePet', () => {
    it('delegates mutate with petId and name', async () => {
        const { result } = renderHook(() => useRenamePet());
        await act(async () => { await result.current.mutate({ petId: '3', name: 'Buddy' }); });
        expect(adapter.renamePet.mutateAsync).toHaveBeenCalledWith({ petId: '3', name: 'Buddy' });
    });

    it('exposes lifecycle error', () => {
        adapter.renamePet.lifecycle.error = new Error('rename failed');
        const { result } = renderHook(() => useRenamePet());
        expect(result.current.error?.message).toBe('rename failed');
    });
});

// ---------- useTransferPet ----------
describe('useTransferPet', () => {
    it('delegates mutate with to and petId', async () => {
        const { result } = renderHook(() => useTransferPet());
        await act(async () => { await result.current.mutate({ to: '0xrecipient', petId: '5' }); });
        expect(adapter.transferPet.mutateAsync).toHaveBeenCalledWith({ petId: '5', to: '0xrecipient' });
    });

    it('wires onSuccess via useTxSuccess', () => {
        const onSuccess = vi.fn();
        renderHook(() => useTransferPet({ onSuccess }));
        const entry = txSuccessRegistry.find(([lc]) => lc === adapter.transferPet.lifecycle);
        expect(entry?.[1]).toBe(onSuccess);
    });
});

// ---------- useTrainPet ----------
describe('useTrainPet', () => {
    it('delegates mutate with petId', async () => {
        const { result } = renderHook(() => useTrainPet());
        await act(async () => { await result.current.mutate({ petId: '9' }); });
        expect(adapter.trainPet.mutateAsync).toHaveBeenCalledWith({ petId: '9' });
    });

    it('reflects hash from lifecycle', () => {
        adapter.trainPet.lifecycle.hash = '0xtrain';
        const { result } = renderHook(() => useTrainPet());
        expect(result.current.hash).toBe('0xtrain');
    });
});
