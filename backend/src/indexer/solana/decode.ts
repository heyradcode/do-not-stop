import bs58 from 'bs58';
import type { RosterPet } from '@repositories/roster.repository';

/**
 * Decode a raw on-chain `PetAccount` into a roster row. Ported from the old
 * Substreams `map_pets` decoder (backend/graph/solana/substreams/src/lib.rs) so
 * the byte layout stays identical — only the source changed (Helius RPC instead
 * of a Firehose stream).
 *
 * If `PetAccount` in
 * `contracts/solana/cryptopets/programs/cryptopets/src/state.rs` changes, update
 * the discriminator, `PET_ACCOUNT_LEN`, and the offsets below.
 */

/** Anchor discriminator for `PetAccount` — sha256("account:PetAccount")[..8]. */
const PET_ACCOUNT_DISCRIMINATOR = Buffer.from([223, 222, 129, 89, 70, 231, 141, 184]);

/**
 * Byte length of a serialized `PetAccount` — Anchor `PetAccount::SPACE`
 * (8-byte discriminator + Borsh-packed fields). Used as a cheap `dataSize`
 * pre-filter on `getProgramAccounts`.
 */
export const PET_ACCOUNT_LEN = 101;

/** Base58 of the discriminator — for the `getProgramAccounts` memcmp filter. */
export const PET_ACCOUNT_DISCRIMINATOR_B58 = bs58.encode(PET_ACCOUNT_DISCRIMINATOR);

/**
 * Decode account data (including the 8-byte Anchor discriminator). Returns
 * `null` when the bytes are not a `PetAccount`, so callers can safely pass any
 * account touched by a transaction and keep only the ones that decode.
 *
 * Borsh layout after the discriminator, in `state.rs` declaration order:
 *   id u32 | owner [u8;32] | dna u64 | rarity u8 | level u16 | ready_time i64 |
 *   win_count u16 | loss_count u16 | bump u8 | name [u8;32] | name_len u8.
 */
export function decodePetAccount(data: Buffer): RosterPet | null {
    if (data.length !== PET_ACCOUNT_LEN) return null;
    if (!data.subarray(0, 8).equals(PET_ACCOUNT_DISCRIMINATOR)) return null;

    const body = data.subarray(8);

    const id = body.readUInt32LE(0);
    const owner = bs58.encode(body.subarray(4, 36)); // base58 pubkey (matches auth storageKey)
    const dna = body.readBigUInt64LE(36);
    const rarity = body.readUInt8(44);
    const level = body.readUInt16LE(45);
    const readyTime = body.readBigInt64LE(47);
    const winCount = body.readUInt16LE(55);
    const lossCount = body.readUInt16LE(57);
    // body[59] = bump (not indexed)
    const nameBytes = body.subarray(60, 92);
    const nameLen = Math.min(body.readUInt8(92), nameBytes.length);
    const name = nameBytes.subarray(0, nameLen).toString('utf8');

    return {
        chain: 'solana',
        petId: id.toString(),
        owner,
        name,
        dna: dna.toString(),
        level,
        rarity,
        winCount,
        lossCount,
        readyAt: readyTime,
    };
}
