import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
    PET_ACCOUNT_ID_MEMCMP_OFFSET,
    PET_ACCOUNT_OWNER_MEMCMP_OFFSET,
} from '../../../src/utils/solana/constants';

describe('solana constants', () => {
    it('offsets the id field past the discriminator', () => {
        // 8-byte discriminator; `id` is PetAccount's first field
        expect(PET_ACCOUNT_ID_MEMCMP_OFFSET).toBe(8);
    });

    it('offsets the owner field past the discriminator and id', () => {
        // 8-byte discriminator + 4-byte id
        expect(PET_ACCOUNT_OWNER_MEMCMP_OFFSET).toBe(12);
    });
});

// ── Cross-language: both offsets are a reading of PetAccount's field order ───────
/**
 * These two numbers are the byte position of a field in an on-chain struct that
 * lives in another language. A field inserted before `owner` in `pet.rs` shifts it,
 * and the memcmp filters here keep querying the old position: no error, just a query
 * that matches nothing, or worse matches on the wrong bytes.
 *
 * This is not hypothetical. Removing `open_to_challenges` from PetAccount shifted
 * every field after it once already, which is what `image-generator`'s solanaLayout
 * spec now guards for its decoder. That guard does not cover these constants.
 */
const here = dirname(fileURLToPath(import.meta.url));
const PET_RS = join(
    here,
    '../../../../contracts/solana/cryptopets/programs/cryptopets/src/state/pet.rs',
);

/** Borsh writes these with no padding, so a type's width is its size on chain. */
const WIDTHS: Record<string, number> = {
    u8: 1, u16: 2, u32: 4, u64: 8, i64: 8, bool: 1, Pubkey: 32,
};

const ANCHOR_DISCRIMINATOR = 8;

/** `[(field, byteOffset)]` for PetAccount, discriminator included. */
const petAccountOffsets = (): [string, number][] => {
    const source = readFileSync(PET_RS, 'utf8');
    const body = source.slice(
        source.indexOf('pub struct PetAccount {'),
        source.indexOf('impl PetAccount'),
    );

    const out: [string, number][] = [];
    let offset = ANCHOR_DISCRIMINATOR;
    for (const line of body.split('\n')) {
        const match = /^\s*pub\s+(\w+):\s*([^,]+),/.exec(line);
        if (!match) continue;
        const type = match[2]!.trim().replace('PetAccount::MAX_NAME_LEN', '32');
        const array = /^\[u8;\s*(\d+)\]$/.exec(type);
        const width = array ? Number(array[1]) : WIDTHS[type];
        // An unhandled type would silently stop advancing the offset and make every
        // assertion below meaningless, so fail loudly instead.
        expect(width, `unhandled PetAccount field type "${type}"`).toBeDefined();
        out.push([match[1]!, offset]);
        offset += width!;
    }
    return out;
};

// Skipped where the contracts are absent, matching the repo's other cross-language specs.
const describeIfProgram = existsSync(PET_RS) ? describe : describe.skip;

describeIfProgram('memcmp offsets vs pet.rs', () => {
    // Guards the guard: an empty field list would agree with anything.
    it('finds the PetAccount struct', () => {
        expect(petAccountOffsets().length).toBeGreaterThan(10);
    });

    it('puts id where PET_ACCOUNT_ID_MEMCMP_OFFSET says it is', () => {
        const offsets = new Map(petAccountOffsets());
        expect(offsets.get('id')).toBe(PET_ACCOUNT_ID_MEMCMP_OFFSET);
    });

    it('puts owner where PET_ACCOUNT_OWNER_MEMCMP_OFFSET says it is', () => {
        const offsets = new Map(petAccountOffsets());
        expect(offsets.get('owner')).toBe(PET_ACCOUNT_OWNER_MEMCMP_OFFSET);
    });
});
