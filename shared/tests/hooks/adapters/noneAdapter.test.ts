import { describe, expect, it } from 'vitest';

import { noneAdapter } from '../../../src/hooks/adapters/noneAdapter';
import { NoActiveChainError } from '../../../src/utils/pets/errors';

describe('noneAdapter', () => {
    it('describes a disconnected chain', () => {
        expect(noneAdapter.kind).toBe('none');
        expect(noneAdapter.isConnected).toBe(false);
        expect(noneAdapter.address).toBeNull();
    });

    it('exposes inert, never-valid capabilities', () => {
        const caps = noneAdapter.capabilities;
        expect(caps.chainLabel).toBe('');
        expect(caps.levelUpFee).toBeNull();
        expect(caps.renameMinLevel).toBe(1);
        expect(caps.address.isValid('anything')).toBe(false);
        expect(caps.explorerTxUrl('0xabc')).toBeNull();
        expect(caps.parseError(new Error('x'), 'fallback')).toEqual({
            message: 'fallback',
            isUserRejection: false,
            isContractError: false,
        });
    });

    it('has an empty, idle pet list', () => {
        expect(noneAdapter.pets.data).toEqual([]);
        expect(noneAdapter.pets.isLoading).toBe(false);
        expect(noneAdapter.pets.error).toBeNull();
    });

    it('rejects every mutation with a NoActiveChainError naming the action', async () => {
        expect(noneAdapter.createPet.isPending).toBe(false);
        expect(noneAdapter.createPet.lifecycle.phase).toBe('idle');

        await expect(noneAdapter.createPet.mutateAsync({} as never)).rejects.toBeInstanceOf(
            NoActiveChainError,
        );
        await expect(noneAdapter.breedPets.mutateAsync({} as never)).rejects.toThrow(
            'Action "breed" requires a connected wallet.',
        );
        await expect(noneAdapter.transferPet.mutateAsync({} as never)).rejects.toThrow(
            'Action "transfer" requires a connected wallet.',
        );
    });
});
