/**
 * Resolves a tokenId to the three values that determine a pet's art:
 * dna, rarity, and speciesId.
 *
 * Reads PetCore directly over JSON-RPC rather than asking the backend. The
 * backend's roster is an indexer projection that can lag or be mid-backfill, and
 * a wrong dna here does not render a slightly stale pet, it renders a different
 * pet and then caches that mistake forever (see store.ts). The contract is the
 * only source that cannot be behind.
 *
 * EVM only in this file. Solana pets are addressed by Metaplex Core asset pubkey
 * and read over a different protocol entirely, so they live in solana.ts behind
 * the same PetReader interface, and readerRouter.ts dispatches between them.
 */

import { createPublicClient, getAddress, http, type Address, type PublicClient } from 'viem';

/** Minimal ABI. Only getPet is needed, but the Pet struct must be spelled out
 *  in full: viem decodes the returned tuple positionally, so an abbreviated
 *  component list would silently misalign dna with some other field.
 *  Mirrors contracts/ethereum/src/PetCore.sol's Pet struct. */
export const PET_CORE_ABI = [
    {
        type: 'function',
        name: 'getPet',
        stateMutability: 'view',
        inputs: [{ name: 'petId', type: 'uint256' }],
        outputs: [
            {
                type: 'tuple',
                components: [
                    { name: 'name', type: 'string' },
                    { name: 'dna', type: 'uint256' },
                    { name: 'level', type: 'uint32' },
                    { name: 'readyTime', type: 'uint32' },
                    { name: 'winCount', type: 'uint16' },
                    { name: 'lossCount', type: 'uint16' },
                    { name: 'rarity', type: 'uint8' },
                    { name: 'xp', type: 'uint32' },
                    { name: 'generation', type: 'uint8' },
                    { name: 'breedCount', type: 'uint8' },
                    { name: 'breedReadyAt', type: 'uint32' },
                    { name: 'trainReadyAt', type: 'uint32' },
                    { name: 'speciesId', type: 'uint16' },
                    { name: 'parent1Id', type: 'uint256' },
                    { name: 'parent2Id', type: 'uint256' },
                    { name: 'lastOpponentId', type: 'uint256' },
                    { name: 'sameOpponentStreak', type: 'uint8' },
                ],
            },
        ],
    },
    {
        type: 'function',
        name: 'totalPets',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'uint256' }],
    },
] as const;

export const SUPPORTED_CHAINS = ['evm', 'solana'] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

export class UnknownPetError extends Error {
    constructor(readonly tokenId: bigint | string) {
        super(`Pet ${tokenId} does not exist`);
        this.name = 'UnknownPetError';
    }
}

export class UnsupportedChainError extends Error {
    constructor(chain: string) {
        super(`Chain "${chain}" is not supported yet (supported: ${SUPPORTED_CHAINS.join(', ')})`);
        this.name = 'UnsupportedChainError';
    }
}

export interface EvmChainConfig {
    rpcUrl: string;
    petCoreAddress: Address;
}

/** The subset of a pet that art derivation needs, plus the name and level the
 *  metadata document shows. */
export interface OnChainPet {
    /** As it appeared in the route. A string rather than a bigint because pet
     *  identifiers are chain-specific: decimal on EVM, but a base58 pubkey on
     *  Solana, so one shape has to cover both. */
    tokenId: string;
    name: string;
    dna: bigint;
    rarity: number;
    /** Absent when the chain does not assign one; the art derivation then falls
     *  back to DNA pair 6. */
    speciesId?: number;
    level: number;
    generation: number;
    winCount: number;
    lossCount: number;
}

/**
 * Each chain identifies pets differently, so the raw route segment is passed
 * through unparsed and every reader validates its own format. An identifier a
 * reader cannot parse is an UnknownPetError, the same as one that parses but was
 * never minted, because both mean there is no such pet to draw.
 */
export interface PetReader {
    read(chain: string, tokenId: string): Promise<OnChainPet>;
}

export const createEvmClient = (config: EvmChainConfig): PublicClient =>
    createPublicClient({ transport: http(config.rpcUrl) }) as PublicClient;

export class EvmPetReader implements PetReader {
    constructor(
        private readonly config: EvmChainConfig,
        private readonly client: PublicClient = createEvmClient(config),
    ) {}

    /**
     * IMPORTANT: `PetCore.getPet` carries no `entryExists` modifier — it reads
     * the mapping directly, so an unminted id returns a zero-valued struct
     * instead of reverting. Trusting it blindly would generate art for a pet
     * that does not exist and cache that forever (see store.ts), so existence is
     * checked against `totalPets`, exactly mirroring PetCore's own
     * `petId > 0 && petId <= _petCount`. Both calls are issued in parallel, so
     * the check costs a second eth_call but no extra latency.
     */
    async read(chain: string, rawTokenId: string): Promise<OnChainPet> {
        if (chain !== 'evm') throw new UnsupportedChainError(chain);

        const tokenId = parseTokenId(rawTokenId);
        // Not a decimal id at all, or zero, which PetCore never mints.
        if (tokenId === null || tokenId === 0n) throw new UnknownPetError(rawTokenId);

        const contract = { address: this.config.petCoreAddress, abi: PET_CORE_ABI } as const;
        const [pet, totalPets] = await Promise.all([
            this.client.readContract({ ...contract, functionName: 'getPet', args: [tokenId] }),
            this.client.readContract({ ...contract, functionName: 'totalPets' }),
        ]);

        if (tokenId > totalPets) throw new UnknownPetError(tokenId);

        // In range but unset: every mint path derives rarity from
        // DnaLib.rarityFromDna or _inheritRarity, both of which return 1-5, so
        // rarity 0 contradicts the bound check. Refuse rather than invent art for
        // a record we do not understand.
        if (pet.rarity === 0) throw new UnknownPetError(tokenId);

        return {
            tokenId: tokenId.toString(),
            name: pet.name,
            dna: pet.dna,
            rarity: pet.rarity,
            speciesId: pet.speciesId,
            level: pet.level,
            generation: pet.generation,
            winCount: pet.winCount,
            lossCount: pet.lossCount,
        };
    }
}

/** Parses a tokenId from a URL path segment. Rejects anything that is not a
 *  plain non-negative integer, so `1e3`, `0x01`, and `-1` do not reach the
 *  contract as something surprising. */
export const parseTokenId = (raw: string): bigint | null => {
    if (!/^\d{1,78}$/.test(raw)) return null;
    return BigInt(raw);
};

export const parsePetCoreAddress = (raw: string): Address => getAddress(raw);
