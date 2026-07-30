/**
 * Checks the PetAccount offset table against the two things that define it.
 *
 * solana.test.ts builds its fixture *with* the offset table and decodes it with
 * the same table, so it catches a wrong decoder but never a wrong table, and the
 * offsets pinned there are my arithmetic rather than the chain's.
 *
 * Two independent sources exist in the monorepo, and they guard different
 * failures:
 *
 * - **The Anchor IDL** (`indexer-go/internal/solana/idl/cryptopets.json`) is what
 *   deployed clients actually decode with, and carries the account discriminator
 *   outright. A wrong discriminator is not subtle: every real account is rejected
 *   and Solana never works at all.
 * - **`pet.rs`** is the current source. Checking both also catches the IDL going
 *   stale against it, which would make this service agree with a program that is
 *   no longer what is deployed.
 *
 * The failure this guards is silent: a field added to PetAccount shifts
 * everything after it, and the decoder would read a plausible dna from the wrong
 * bytes and cache art for it permanently.
 *
 * Reads are skipped when the monorepo is absent, so the service still tests
 * standalone. These are test-time file reads, not build dependencies.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIELD_SIZES, PET_ACCOUNT_SPACE, petAccountDiscriminator } from './solana.js';

const IDL_PATH = join('..', 'indexer-go', 'internal', 'solana', 'idl', 'cryptopets.json');
const PET_RS = join('..', 'contracts', 'solana', 'cryptopets', 'programs', 'cryptopets', 'src', 'state', 'pet.rs');

/** Borsh writes these with no padding, so a type's width is its size on chain. */
const WIDTHS: Record<string, number> = {
    u8: 1, u16: 2, u32: 4, u64: 8, i64: 8, bool: 1, pubkey: 32, Pubkey: 32,
};

type IdlType = string | { array: [string, number] };

const widthOf = (type: IdlType): number => {
    if (typeof type !== 'string') return type.array[1];
    const width = WIDTHS[type];
    expect(width, `unhandled type "${type}"`).toBeDefined();
    return width!;
};

/** Our table without the discriminator, which is not a struct field. */
const ourFields = FIELD_SIZES.slice(1).map(([name, bytes]) => [name, bytes] as [string, number]);

const describeIf = (path: string) => (existsSync(path) ? describe : describe.skip);

// Read inside the tests, never in a describe body: vitest evaluates the body of a
// skipped describe, so a top-level readFileSync throws where the file is absent
// and the skip never gets a chance to apply.
const readIdl = () => {
    const idl = JSON.parse(readFileSync(IDL_PATH, 'utf8')) as {
        accounts?: { name: string; discriminator: number[] }[];
        types?: { name: string; type: { fields: { name: string; type: IdlType }[] } }[];
    };
    const fields = idl.types?.find((t) => t.name === 'PetAccount')?.type.fields ?? [];
    return { idl, layout: fields.map((f) => [f.name, widthOf(f.type)] as [string, number]) };
};

describeIf(IDL_PATH)('PetAccount layout vs the Anchor IDL', () => {

    // Guards the guard: an empty layout would agree with anything.
    it('found the account in the IDL', () => {
        expect(readIdl().layout.length).toBeGreaterThan(20);
    });

    it('has the same fields, in the same order, at the same widths', () => {
        expect(ourFields).toEqual(readIdl().layout);
    });

    it('totals the same account size once the discriminator is added', () => {
        const total = readIdl().layout.reduce((sum, [, bytes]) => sum + bytes, 0);
        expect(PET_ACCOUNT_SPACE).toBe(total + 8);
    });

    // Computed as sha256("account:PetAccount")[0..8] rather than read from
    // anywhere. If that convention were wrong, every real account would fail the
    // discriminator check and Solana would never serve a single pet.
    it('computes the discriminator Anchor generated', () => {
        const expected = readIdl().idl.accounts?.find((a) => a.name === 'PetAccount')?.discriminator;
        expect(expected).toBeDefined();
        expect([...petAccountDiscriminator()]).toEqual(expected);
    });
});

/** Same reason as readIdl: never read at describe level. */
const readRustLayout = (): [string, number][] => {
    const toCamel = (name: string): string =>
        name.replace(/^_+/, '').replace(/_([a-z])/g, (_full, c: string) => c.toUpperCase());

    const source = readFileSync(PET_RS, 'utf8');
    const body = source.slice(source.indexOf('pub struct PetAccount {'), source.indexOf('impl PetAccount'));

    const layout: [string, number][] = [];
    for (const line of body.split('\n')) {
        const match = /^\s*pub\s+(\w+):\s*([^,]+),/.exec(line);
        if (!match) continue;
        const type = match[2]!.trim().replace('PetAccount::MAX_NAME_LEN', '32');
        const array = /^\[u8;\s*(\d+)\]$/.exec(type);
        layout.push([toCamel(match[1]!), array ? Number(array[1]) : widthOf(type)]);
    }
    return layout;
};

describeIf(PET_RS)('PetAccount layout vs pet.rs', () => {
    it('found the struct in the source', () => {
        expect(readRustLayout().length).toBeGreaterThan(20);
    });

    // Disagreement here means the checked-in IDL no longer matches the program
    // source, so this service would decode for a program that is not deployed.
    it('matches the current Rust struct too, so the IDL is not stale', () => {
        expect(ourFields).toEqual(readRustLayout());
    });
});
