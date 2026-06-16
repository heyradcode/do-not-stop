import { beforeEach, describe, expect, it, vi } from 'vitest';

const makeMutation = () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    lifecycle: { error: null as Error | null, hash: '0xhash', reset: vi.fn(), phase: 'idle' },
});

const adapter = {
    createPet: makeMutation(),
    levelUpPet: makeMutation(),
    renamePet: makeMutation(),
    transferPet: makeMutation(),
};

const useTxSuccess = vi.fn();
vi.mock('../../src/hooks/adapters/useChainAdapter', () => ({ useChainAdapter: () => adapter }));
vi.mock('../../src/hooks/useTxSuccess', () => ({ useTxSuccess: (...a: unknown[]) => useTxSuccess(...a) }));

import { useCreatePet } from '../../src/hooks/useCreatePet';
import { useLevelUpPet } from '../../src/hooks/useLevelUpPet';
import { useRenamePet } from '../../src/hooks/useRenamePet';
import { useTransferPet } from '../../src/hooks/useTransferPet';

beforeEach(() => {
    vi.clearAllMocks();
    Object.values(adapter).forEach((m) => {
        m.isPending = false;
        m.lifecycle.error = null;
    });
});

describe('useCreatePet', () => {
    it('maps args to the adapter mutation and exposes lifecycle fields', async () => {
        const onSuccess = vi.fn();
        const hook = useCreatePet({ onSuccess });

        await hook.mutate({ name: 'Sparky', dna: 1n, rarity: 2 });
        expect(adapter.createPet.mutateAsync).toHaveBeenCalledWith({
            name: 'Sparky',
            dna: 1n,
            rarity: 2,
        });

        expect(hook.hash).toBe('0xhash');
        expect(hook.reset).toBe(adapter.createPet.lifecycle.reset);
        expect(useTxSuccess).toHaveBeenCalledWith(adapter.createPet.lifecycle, onSuccess);
    });

    it('reflects the adapter pending and error state', () => {
        adapter.createPet.isPending = true;
        adapter.createPet.lifecycle.error = new Error('boom');

        const hook = useCreatePet();
        expect(hook.isPending).toBe(true);
        expect(hook.error?.message).toBe('boom');
    });
});

describe('useLevelUpPet', () => {
    it('passes the pet id through', async () => {
        await useLevelUpPet().mutate({ petId: '7' });
        expect(adapter.levelUpPet.mutateAsync).toHaveBeenCalledWith({ petId: '7' });
    });
});

describe('useRenamePet', () => {
    it('passes pet id and name through', async () => {
        await useRenamePet().mutate({ petId: '7', name: 'Newname' });
        expect(adapter.renamePet.mutateAsync).toHaveBeenCalledWith({ petId: '7', name: 'Newname' });
    });
});

describe('useTransferPet', () => {
    it('passes recipient and pet id through', async () => {
        await useTransferPet().mutate({ to: '0xrecipient', petId: '7' });
        expect(adapter.transferPet.mutateAsync).toHaveBeenCalledWith({
            petId: '7',
            to: '0xrecipient',
        });
    });
});
