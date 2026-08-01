/**
 * Solana pet reader, over plain JSON-RPC with no Solana SDK dependency.
 *
 * A Solana pet is addressed by its Metaplex Core **asset pubkey**, not a numeric
 * id: `PetAccount`'s PDA seeds are `[b"pet", asset_pubkey]` (see
 * contracts/solana/.../instructions/battle/commit_battle.rs).
 *
 * Deriving that PDA locally would need an ed25519 off-curve check, which is the
 * one part of `findProgramAddress` that cannot be done with node:crypto alone. So
 * the lookup goes the other way: `getProgramAccounts` with a memcmp filter on the
 * `asset` field the account already stores. That trades a cheap keyed read for a
 * filtered scan, which is fine at this collection's size and avoids taking a
 * dependency for one address derivation. If it ever becomes the bottleneck, the
 * fix is to pass the PetAccount address directly and use getAccountInfo.
 * Some hosted RPC providers disable getProgramAccounts; that surfaces as an
 * upstream error, not as a missing pet.
 *
 * The account is decoded by fixed offsets rather than through Anchor. Borsh lays
 * `PetAccount` out with no padding and every field this service needs is a
 * fixed-width scalar, so the offsets are exact. FIELD_SIZES transcribes
 * `PetAccount::SPACE` term for term so the two can be diffed by eye, and a test
 * pins the total.
 *
 * NOTE: unverified against a live cluster. There is no Solana toolchain or
 * validator in the environment this was written in (the same caveat CLAUDE.md
 * records for this repo's Rust changes), so it is covered by synthetic fixtures
 * built from the same offset table it reads. A real devnet account is what would
 * actually confirm it.
 */

import { createHash } from 'node:crypto';
import { isValidPubkey } from './base58.js';
import { UnknownPetError, UnsupportedChainError, type OnChainPet, type PetReader } from './chain.js';

/**
 * Field widths in declaration order, transcribed from `PetAccount::SPACE` in
 * contracts/solana/cryptopets/programs/cryptopets/src/state/pet.rs. Offsets are
 * derived from this rather than written by hand, so a field added upstream means
 * adding one line here instead of renumbering everything.
 */
export const FIELD_SIZES: readonly (readonly [name: string, bytes: number])[] = [
    ['discriminator', 8],
    ['id', 4],
    ['owner', 32],
    ['dna', 8],
    ['rarity', 1],
    ['level', 2],
    ['readyTime', 8],
    ['winCount', 2],
    ['lossCount', 2],
    ['version', 1],
    ['bump', 1],
    ['name', 32],
    ['nameLen', 1],
    ['openToChallenges', 1],
    ['xp', 4],
    ['lastOpponentId', 4],
    ['sameOpponentStreak', 1],
    ['generation', 1],
    ['parent1Id', 4],
    ['parent2Id', 4],
    ['breedCount', 1],
    ['breedReadyTime', 8],
    ['trainReadyTime', 8],
    ['speciesId', 2],
    ['spouseId', 4],
    ['marriageOwnerSnapshot', 32],
    ['marriageCooldownUntil', 8],
    ['asset', 32],
    ['reserved', 8],
];

const buildOffsets = (): { offsets: Record<string, number>; total: number } => {
    const offsets: Record<string, number> = {};
    let cursor = 0;
    for (const [name, bytes] of FIELD_SIZES) {
        offsets[name] = cursor;
        cursor += bytes;
    }
    return { offsets, total: cursor };
};

const { offsets: OFFSET, total: SPACE } = buildOffsets();

export { OFFSET as PET_ACCOUNT_OFFSETS, SPACE as PET_ACCOUNT_SPACE };

/** Anchor prefixes every account with sha256("account:<Name>")[0..8]. Checking it
 *  is what stops an unrelated account from being decoded as a plausible pet. */
export const petAccountDiscriminator = (): Buffer =>
    createHash('sha256').update('account:PetAccount').digest().subarray(0, 8);

export interface SolanaChainConfig {
    rpcUrl: string;
    programId: string;
}

interface RpcAccount {
    account: { data: [string, string] };
}

export class SolanaRpcError extends Error {}

/** Minimal JSON-RPC caller. fetchImpl is injectable so tests never open a socket. */
const rpc = async <T>(
    rpcUrl: string,
    method: string,
    params: unknown[],
    fetchImpl: typeof fetch,
): Promise<T> => {
    const response = await fetchImpl(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!response.ok) {
        throw new SolanaRpcError(`Solana RPC ${method} returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as { result?: T; error?: { message?: string } };
    if (body.error) {
        throw new SolanaRpcError(`Solana RPC ${method} failed: ${body.error.message ?? 'unknown error'}`);
    }
    if (body.result === undefined) {
        throw new SolanaRpcError(`Solana RPC ${method} returned no result`);
    }
    return body.result;
};

export class SolanaPetReader implements PetReader {
    constructor(
        private readonly config: SolanaChainConfig,
        private readonly fetchImpl: typeof fetch = fetch,
    ) {}

    /** `tokenId` here is the Core asset pubkey in base58. */
    async read(chain: string, tokenId: string): Promise<OnChainPet> {
        if (chain !== 'solana') throw new UnsupportedChainError(chain);
        // Rejected before the RPC call: an EVM decimal id routed here is not a
        // pubkey, and neither is junk.
        if (!isValidPubkey(tokenId)) throw new UnknownPetError(tokenId);

        const accounts = await rpc<RpcAccount[]>(
            this.config.rpcUrl,
            'getProgramAccounts',
            [
                this.config.programId,
                {
                    encoding: 'base64',
                    filters: [
                        // dataSize first: it is the cheapest filter and rules out
                        // every other account type this program owns.
                        { dataSize: SPACE },
                        { memcmp: { offset: OFFSET.asset!, bytes: tokenId } },
                    ],
                },
            ],
            this.fetchImpl,
        );

        // No account means no such pet. This is the Solana equivalent of EVM's
        // totalPets bound check: without it the service would invent art for a pet
        // that does not exist and cache it forever.
        const [first] = accounts;
        if (!first) throw new UnknownPetError(tokenId);

        return decodePetAccount(Buffer.from(first.account.data[0], 'base64'), tokenId);
    }
}

export const decodePetAccount = (data: Buffer, assetBase58: string): OnChainPet => {
    if (data.length < SPACE) {
        throw new Error(
            `PetAccount data is ${data.length} bytes, expected at least ${SPACE}:`
            + ' the on-chain layout has changed, so the offset table in solana.ts is stale',
        );
    }
    if (!data.subarray(0, 8).equals(petAccountDiscriminator())) {
        throw new Error('Account is not a PetAccount (discriminator mismatch)');
    }

    const nameLen = Math.min(data.readUInt8(OFFSET.nameLen!), 32);
    const speciesId = data.readUInt16LE(OFFSET.speciesId!);

    return {
        // Echoed back as the caller supplied it, so metadata stays addressable by
        // what was requested.
        tokenId: assetBase58,
        name: data.subarray(OFFSET.name!, OFFSET.name! + nameLen).toString('utf8'),
        dna: data.readBigUInt64LE(OFFSET.dna!),
        rarity: data.readUInt8(OFFSET.rarity!),
        // species_id is documented as "0 until species pools land on Solana", so 0
        // means unset here, not species zero. Passing it through would give every
        // Solana pet the same body; omitting it makes the trait derivation fall
        // back to DNA pair 6. On EVM 0 is a real species, which is why this is
        // decided per chain rather than inside derivePetVisualTraits.
        ...(speciesId === 0 ? {} : { speciesId }),
        level: data.readUInt16LE(OFFSET.level!),
        generation: data.readUInt8(OFFSET.generation!),
        winCount: data.readUInt16LE(OFFSET.winCount!),
        lossCount: data.readUInt16LE(OFFSET.lossCount!),
    };
};
