import bs58 from 'bs58';
import { Buffer } from 'buffer';
import { PublicKey } from '@solana/web3.js';
import type { Idl, Program } from '@coral-xyz/anchor';
import { PET_ACCOUNT_ID_MEMCMP_OFFSET } from './constants';
import { petPdaByAsset } from './pdas';

export type AnchorAccountClient = {
    fetch: (key: unknown) => Promise<unknown>;
    fetchNullable: (key: unknown) => Promise<unknown>;
    all: (filters?: unknown) => Promise<{ publicKey: unknown; account: Record<string, unknown> }[]>;
};

/**
 * Resolve an Anchor account-namespace client by IDL account name. Anchor 0.31+ exposes
 * camelCase keys (`globalState`); older IDLs used PascalCase (`GlobalState`) — we try both.
 */
export const getAccountClient = (program: Program<Idl>, name: string): AnchorAccountClient => {
    const acc = program.account as Record<string, Partial<AnchorAccountClient> | undefined>;
    const pascal = name.charAt(0).toUpperCase() + name.slice(1);
    const client = acc[name] ?? acc[pascal];
    if (!client) {
        throw new Error(`IDL has no account client for "${name}"`);
    }
    return client as AnchorAccountClient;
};

/**
 * Fetch the `marriage_owner_snapshot` field from a `PetAccount` keyed by its Core asset
 * pubkey. This is the spouse's wallet captured at `accept_marriage` time and is the
 * correct `parent2Owner` for cross-owner Solana breeding. Returns `null` when the account
 * doesn't exist or the snapshot is the zero pubkey (pet is not married).
 */
export const fetchMarriageOwnerSnapshot = async (
    program: Program<Idl>,
    programId: PublicKey,
    assetKey: PublicKey,
): Promise<PublicKey | null> => {
    const [petPda] = petPdaByAsset(programId, assetKey.toBase58());
    const account = await getAccountClient(program, 'petAccount').fetchNullable(petPda);
    if (!account) return null;
    const snap = (account as Record<string, unknown>).marriageOwnerSnapshot;
    if (!snap || typeof snap !== 'object') return null;
    const pk = snap as PublicKey;
    return pk.equals(PublicKey.default) ? null : pk;
};

/**
 * Look up any `PetAccount` by its numeric ID using a memcmp filter on the `id` field
 * (offset 8, 4 bytes LE). Returns the on-chain Core asset `PublicKey`, or `null` if not found.
 */
export const fetchAssetByPetId = async (
    program: Program<Idl>,
    petId: number,
): Promise<PublicKey | null> => {
    const idBuf = Buffer.alloc(4);
    idBuf.writeUInt32LE(petId >>> 0, 0);
    const rows = await getAccountClient(program, 'petAccount').all([{
        memcmp: { offset: PET_ACCOUNT_ID_MEMCMP_OFFSET, bytes: bs58.encode(idBuf) },
    }]);
    // Destructure-and-guard rather than `rows[0]`: under `noUncheckedIndexedAccess`
    // (enabled by backend, the first non-frontend/mobile consumer of this module),
    // indexed access doesn't narrow away from a `.length` check the way this did before.
    const [first] = rows;
    if (!first) return null;
    const asset = (first.account as { asset?: unknown }).asset;
    if (!asset || typeof asset !== 'object') return null;
    return asset as PublicKey;
};
