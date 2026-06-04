import type { RosterPet } from '@repositories/roster.repository';
import idlJson from '../idl/cryptopets.json';
import {
    resolveAccountLayout,
    decodeStruct,
    type AnchorIdl,
} from './anchorIdl';

/**
 * Decode a raw on-chain `PetAccount` into a roster row.
 *
 * The discriminator, byte length, and field layout all come from the Anchor IDL
 * (`indexing/solana/idl/cryptopets.json`). When the on-chain `PetAccount` struct
 * changes, regenerate the IDL with `anchor build` and copy
 * `target/idl/cryptopets.json` over the file here — no code changes needed.
 */

const PET_ACCOUNT_LAYOUT = resolveAccountLayout(idlJson as unknown as AnchorIdl, 'PetAccount');

/** Total serialized size: 8-byte discriminator + Borsh body. `getProgramAccounts` dataSize filter. */
export const PET_ACCOUNT_LEN = 8 + PET_ACCOUNT_LAYOUT.bodySize;

/** Base58 discriminator — for the `getProgramAccounts` memcmp filter. */
export const PET_ACCOUNT_DISCRIMINATOR_B58 = PET_ACCOUNT_LAYOUT.discriminatorB58;

/**
 * Decode account data (including the 8-byte discriminator). Returns `null` when
 * the bytes are not a `PetAccount`, so callers can pass any account touched by a
 * transaction and keep only the ones that decode.
 */
export function decodePetAccount(data: Buffer): RosterPet | null {
    if (data.length !== PET_ACCOUNT_LEN) return null;
    if (!data.subarray(0, 8).equals(PET_ACCOUNT_LAYOUT.discriminator)) return null;

    const fields = decodeStruct(PET_ACCOUNT_LAYOUT.fields, data.subarray(8));

    const nameBuf = fields.name as Buffer;
    const nameLen = fields.nameLen as number;
    // A name length past the fixed buffer means the layout drifted — bail rather
    // than emit a garbage name.
    if (nameLen > nameBuf.length) return null;

    return {
        chain: 'solana',
        petId: String(fields.id),
        owner: fields.owner as string,
        name: nameBuf.subarray(0, nameLen).toString('utf8'),
        dna: String(fields.dna),
        level: fields.level as number,
        rarity: fields.rarity as number,
        winCount: fields.winCount as number,
        lossCount: fields.lossCount as number,
        readyAt: fields.readyTime as bigint,
    };
}
