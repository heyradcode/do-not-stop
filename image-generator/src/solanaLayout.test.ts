/**
 * Checks the PetAccount offset table against the Rust struct it transcribes.
 *
 * solana.test.ts builds its fixture *with* the offset table and decodes it with
 * the same table, so it catches a wrong decoder but never a wrong table. The
 * offsets pinned there are my arithmetic, not the chain's. This derives the
 * layout independently, from field order and types in `pet.rs`, and compares.
 *
 * It matters because the failure is silent: a field added to PetAccount shifts
 * everything after it, and the decoder would read a plausible dna from the wrong
 * bytes and cache art for it permanently. Nothing else would notice.
 *
 * The read is skipped when the contracts tree is absent, so the service still
 * tests standalone. This is a test-time file read, not a build dependency: the
 * service continues to import nothing from the monorepo.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIELD_SIZES, PET_ACCOUNT_SPACE } from './solana.js';

const PET_RS = join('..', 'contracts', 'solana', 'cryptopets', 'programs', 'cryptopets', 'src', 'state', 'pet.rs');

/** Borsh writes these with no padding, so a type's width is its size on chain. */
const RUST_SIZES: Record<string, number> = {
    u8: 1,
    u16: 2,
    u32: 4,
    u64: 8,
    i64: 8,
    bool: 1,
    Pubkey: 32,
    '[u8; 32]': 32,
    '[u8; 8]': 8,
};

const toCamel = (name: string): string =>
    name.replace(/^_+/, '').replace(/_([a-z])/g, (_full, c: string) => c.toUpperCase());

/** Field order and widths taken from the struct declaration itself. */
const layoutFromRust = (source: string): [string, number][] => {
    const body = source.slice(source.indexOf('pub struct PetAccount {'), source.indexOf('impl PetAccount'));
    const fields: [string, number][] = [];

    for (const line of body.split('\n')) {
        const match = /^\s*pub\s+(\w+):\s*([^,]+),/.exec(line);
        if (!match) continue;

        const name = match[1]!;
        const type = match[2]!.trim().replace('PetAccount::MAX_NAME_LEN', '32');
        const size = RUST_SIZES[type];
        expect(size, `unhandled Rust type "${type}" for field ${name}`).toBeDefined();

        fields.push([toCamel(name), size!]);
    }

    // Anchor prefixes every account with an 8-byte discriminator, which is not a
    // struct field but is part of the on-chain layout.
    return [['discriminator', 8], ...fields];
};

const describeIfPresent = existsSync(PET_RS) ? describe : describe.skip;

describeIfPresent('PetAccount layout vs the Rust struct', () => {
    const rust = layoutFromRust(readFileSync(PET_RS, 'utf8'));
    const ours = FIELD_SIZES.map(([name, bytes]) => [name, bytes] as [string, number]);

    it('has the same fields in the same order', () => {
        expect(ours.map(([name]) => name)).toEqual(rust.map(([name]) => name));
    });

    it('gives every field the width its Rust type has', () => {
        expect(ours).toEqual(rust);
    });

    it('totals the same account size', () => {
        const sum = (fields: [string, number][]) => fields.reduce((total, [, bytes]) => total + bytes, 0);
        expect(PET_ACCOUNT_SPACE).toBe(sum(rust));
    });

    // Guards the guard: if the struct is ever reformatted so the regex stops
    // matching, an empty layout would trivially agree with nothing.
    it('actually parsed the struct', () => {
        expect(rust.length).toBeGreaterThan(20);
    });
});
