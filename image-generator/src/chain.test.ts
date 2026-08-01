import { describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';
import {
    EvmPetReader,
    PET_CORE_ABI,
    UnknownPetError,
    UnsupportedChainError,
    parsePetCoreAddress,
    parseTokenId,
} from './chain.js';

const CONFIG = {
    rpcUrl: 'https://rpc.example',
    petCoreAddress: '0x0BB0e03259Cf9DA7B0A3e258e2D17d68D7be9d33' as const,
};

/** viem decodes the Pet tuple into a named object; mirror that shape. */
const PET = {
    name: 'Sparky',
    dna: 79_34_05_61_88_13_42_07n,
    level: 4,
    readyTime: 0,
    winCount: 3,
    lossCount: 1,
    rarity: 3,
    xp: 120,
    generation: 1,
    breedCount: 0,
    breedReadyAt: 0,
    trainReadyAt: 0,
    speciesId: 6,
    parent1Id: 0n,
    parent2Id: 0n,
    lastOpponentId: 0n,
    sameOpponentStreak: 0,
};

/** getPet and totalPets go through the same readContract; dispatch on which. */
const client = (pet: unknown, totalPets = 10n): PublicClient =>
    ({
        readContract: vi.fn(async ({ functionName }: { functionName: string }) =>
            functionName === 'totalPets' ? totalPets : pet),
    }) as unknown as PublicClient;

const clientRejecting = (error: unknown): PublicClient =>
    ({ readContract: vi.fn(async () => { throw error; }) }) as unknown as PublicClient;

/** What getPet returns for an id that was never minted: a zero-valued struct,
 *  not a revert. */
const ZERO_PET = {
    ...PET,
    name: '',
    dna: 0n,
    level: 0,
    winCount: 0,
    lossCount: 0,
    rarity: 0,
    speciesId: 0,
    generation: 0,
};

describe('PET_CORE_ABI', () => {
    it('spells out the full Pet struct so the tuple decodes positionally', () => {
        // A missing component would silently shift dna onto another field, which
        // would cache the wrong art forever.
        const components = PET_CORE_ABI[0].outputs[0]!.components;
        expect(components).toHaveLength(17);
        expect(components.map((c) => c.name).slice(0, 7)).toEqual([
            'name',
            'dna',
            'level',
            'readyTime',
            'winCount',
            'lossCount',
            'rarity',
        ]);
        expect(components[12]!.name).toBe('speciesId');
    });
});

describe('EvmPetReader', () => {
    it('reads getPet and projects the fields art and metadata need', async () => {
        const c = client(PET);
        const pet = await new EvmPetReader(CONFIG, c).read('evm', '7');

        expect(pet).toEqual({
            tokenId: '7',
            name: 'Sparky',
            dna: PET.dna,
            rarity: 3,
            speciesId: 6,
            level: 4,
            generation: 1,
            winCount: 3,
            lossCount: 1,
        });
        expect(vi.mocked(c.readContract).mock.calls[0]![0]).toMatchObject({
            address: CONFIG.petCoreAddress,
            functionName: 'getPet',
            args: [7n],
        });
    });

    // getPet has no entryExists modifier: an unminted id reads back as a zero
    // struct. Without the totalPets bound check the service would generate and
    // permanently cache art for a pet that does not exist.
    it('rejects a tokenId beyond totalPets, which getPet answers with a zero struct', async () => {
        const reader = new EvmPetReader(CONFIG, client(ZERO_PET, 10n));
        await expect(reader.read('evm', '11')).rejects.toThrow(UnknownPetError);
    });

    it('rejects tokenId 0, which PetCore never mints', async () => {
        const reader = new EvmPetReader(CONFIG, client(ZERO_PET, 10n));
        await expect(reader.read('evm', '0')).rejects.toThrow(UnknownPetError);
    });

    it('rejects an in-range record with rarity 0, which no mint path produces', async () => {
        const reader = new EvmPetReader(CONFIG, client(ZERO_PET, 10n));
        await expect(reader.read('evm', '5')).rejects.toThrow(UnknownPetError);
    });

    it('accepts the last minted id', async () => {
        const reader = new EvmPetReader(CONFIG, client(PET, 7n));
        await expect(reader.read('evm', '7')).resolves.toMatchObject({ tokenId: '7' });
    });

    it('rejects an identifier that is not a decimal id, without calling the chain', async () => {
        const c = client(PET);
        const reader = new EvmPetReader(CONFIG, c);

        // A base58 Solana asset routed at /image/evm/... must not reach the RPC.
        await expect(reader.read('evm', 'So11111111111111111111111111111111111111112'))
            .rejects.toThrow(UnknownPetError);
        expect(vi.mocked(c.readContract)).not.toHaveBeenCalled();
    });

    it('propagates transport failures instead of reporting a missing pet', async () => {
        const reader = new EvmPetReader(CONFIG, clientRejecting(new Error('fetch failed: ECONNREFUSED')));
        await expect(reader.read('evm', '1')).rejects.toThrow(/ECONNREFUSED/);
    });

    it('rejects chains it cannot read rather than guessing', async () => {
        const reader = new EvmPetReader(CONFIG, client(PET));
        await expect(reader.read('solana', '1')).rejects.toThrow(UnsupportedChainError);
    });
});

describe('parseTokenId', () => {
    it('accepts plain non-negative integers', () => {
        expect(parseTokenId('0')).toBe(0n);
        expect(parseTokenId('12345')).toBe(12345n);
    });

    it('rejects anything that is not a decimal integer', () => {
        for (const raw of ['-1', '1e3', '0x01', '1.5', '', ' 1', 'abc', '1_000']) {
            expect(parseTokenId(raw)).toBeNull();
        }
    });

    it('rejects absurdly long input rather than allocating a huge bigint', () => {
        expect(parseTokenId('9'.repeat(79))).toBeNull();
    });
});

describe('parsePetCoreAddress', () => {
    it('checksums a lowercase address', () => {
        expect(parsePetCoreAddress(CONFIG.petCoreAddress.toLowerCase())).toBe(CONFIG.petCoreAddress);
    });

    it('throws on a malformed address at startup rather than per request', () => {
        expect(() => parsePetCoreAddress('0xnope')).toThrow();
    });
});
