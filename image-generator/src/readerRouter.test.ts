import { describe, expect, it, vi } from 'vitest';
import { UnsupportedChainError, type OnChainPet, type PetReader } from './chain.js';
import { ChainNotConfiguredError, createReaderRouter } from './readerRouter.js';

const PET: OnChainPet = {
    tokenId: '7',
    name: 'Sparky',
    dna: 79_34_05_61_88_13_42_07n,
    rarity: 3,
    speciesId: 6,
    level: 4,
    generation: 1,
    winCount: 3,
    lossCount: 1,
};

const stub = (): PetReader => ({ read: vi.fn(async () => PET) });

describe('createReaderRouter', () => {
    it('delegates to the reader for the chain, passing both arguments through', async () => {
        const evm = stub();
        const pet = await createReaderRouter({ evm }).read('evm', '7');

        expect(pet).toBe(PET);
        expect(vi.mocked(evm.read)).toHaveBeenCalledWith('evm', '7');
    });

    it('rejects a chain this service does not implement at all', async () => {
        // Permanent: no configuration would make it work.
        await expect(createReaderRouter({ evm: stub() }).read('bitcoin', '7'))
            .rejects.toThrow(UnsupportedChainError);
    });

    it('distinguishes an unconfigured supported chain from an unsupported one', async () => {
        // A supported chain with no reader wired up is an operator problem, so it
        // must not be reported as "not supported", which reads as permanent.
        const router = createReaderRouter({});

        await expect(router.read('evm', '7')).rejects.toThrow(ChainNotConfiguredError);
        await expect(router.read('evm', '7')).rejects.not.toThrow(UnsupportedChainError);
    });

    it('propagates whatever the underlying reader throws', async () => {
        const evm: PetReader = { read: async () => { throw new Error('rpc exploded'); } };
        await expect(createReaderRouter({ evm }).read('evm', '7')).rejects.toThrow('rpc exploded');
    });

    it('never calls a reader for a chain it was not registered under', async () => {
        const evm = stub();
        await expect(createReaderRouter({ evm }).read('solana', '7')).rejects.toThrow();
        expect(vi.mocked(evm.read)).not.toHaveBeenCalled();
    });
});
