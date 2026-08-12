import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The Solana constants this package hardcodes, against the program that defines them.
 *
 * Two kinds of value here are transcribed by hand from Rust, and neither fails to compile
 * when the program moves:
 *
 * - **PDA seeds.** A wrong seed derives a real, valid address that nothing lives at, so the
 *   failure is "account not found" on a write the player already paid a wallet prompt for.
 *   `pdas.test.ts` says outright that it cannot catch this — it pins the derived addresses,
 *   which proves they have not changed, not that they were ever right.
 * - **memcmp offsets.** `usePets` filters `getProgramAccounts` on the owner at a byte
 *   offset, and `fetchAssetByPetId` on the id. A stale offset does not error: it matches
 *   nothing, so a wallet's gallery is empty and a cross-owner breed cannot find its partner.
 *
 * Nothing else checks either. No CI job builds Rust, so `anchor build` and the program's own
 * tests run on a developer's machine or nowhere. Reading the source with a regex is cruder
 * than compiling it and catches what matters: the literal bytes both sides have to agree on.
 */

const PROGRAMS = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../contracts/solana/cryptopets/programs',
);

const CRYPTOPETS_STATE = join(PROGRAMS, 'cryptopets/src/state');
const REWARDS_STATE = join(PROGRAMS, 'cryptopets-rewards/src/state.rs');

/** Every `pub const <NAME>: &[u8] = b"...";` in a file, keyed by the struct that declares it. */
function seedsIn(file: string): Map<string, string> {
    const source = readFileSync(file, 'utf8');
    const seeds = new Map<string, string>();

    // Struct-scoped seeds: `impl Foo { pub const SEED: &'static [u8] = b"foo"; }`.
    for (const block of source.split('impl ').slice(1)) {
        const struct = block.split(/[\s<{]/)[0]!;
        for (const match of block.matchAll(/pub const (\w*SEED): &'static \[u8\] = b"([^"]+)"/g)) {
            seeds.set(`${struct}::${match[1]}`, match[2]!);
        }
    }
    // Free constants: `pub const FEE_VAULT_SEED: &[u8] = b"fee-vault";`.
    for (const match of source.matchAll(/^pub const (\w+): &\[u8\] = b"([^"]+)"/gm)) {
        seeds.set(match[1]!, match[2]!);
    }
    return seeds;
}

const petSeeds = seedsIn(join(CRYPTOPETS_STATE, 'pet.rs'));
const globalSeeds = seedsIn(join(CRYPTOPETS_STATE, 'global.rs'));
const itemSeeds = seedsIn(join(CRYPTOPETS_STATE, 'item.rs'));
const marriageSeeds = seedsIn(join(CRYPTOPETS_STATE, 'marriage.rs'));
const requestSeeds = seedsIn(join(CRYPTOPETS_STATE, 'requests.rs'));
const modSeeds = seedsIn(join(CRYPTOPETS_STATE, 'mod.rs'));
const rewardSeeds = seedsIn(REWARDS_STATE);

/** The seed string `pdas.ts` passes, read back out of its own source. */
const PDAS_TS = join(dirname(fileURLToPath(import.meta.url)), '../../../src/utils/solana/pdas.ts');
const pdasSource = readFileSync(PDAS_TS, 'utf8');

function tsSeed(constName: string): string {
    const match = new RegExp(`const ${constName} = Buffer\\.from\\('([^']+)'\\)`).exec(pdasSource);
    expect(match, `${constName} is not declared in pdas.ts`).not.toBeNull();
    return match![1]!;
}

describe('PDA seeds match the program', () => {
    it.each([
        ['GLOBAL_STATE_SEED', () => globalSeeds.get('GlobalState::SEED')],
        ['PLAYER_PROFILE_SEED', () => globalSeeds.get('PlayerProfile::SEED')],
        ['PET_SEED', () => petSeeds.get('PetAccount::SEED')],
        ['BREED_REQUEST_SEED', () => requestSeeds.get('BreedRequest::SEED')],
        ['MINT_REQUEST_SEED', () => requestSeeds.get('MintRequest::SEED')],
        ['MARRIAGE_PROPOSAL_SEED', () => marriageSeeds.get('MarriageProposal::SEED')],
        ['STUD_FEE_SEED', () => marriageSeeds.get('StudFeeAccount::SEED')],
        ['FEE_VAULT_SEED', () => modSeeds.get('FEE_VAULT_SEED')],
        ['ITEM_SEED', () => itemSeeds.get('ItemBalance::SEED')],
        ['ITEM_SLOT_SEED', () => itemSeeds.get('ItemSlot::SEED')],
        ['EQUIPMENT_SEED', () => itemSeeds.get('PetEquipment::SEED')],
        ['REWARDS_SEED', () => rewardSeeds.get('RewardsState::SEED')],
        ['SEASON_SEED', () => rewardSeeds.get('Season::SEED')],
        ['VAULT_SEED', () => rewardSeeds.get('Season::VAULT_SEED')],
        ['CLAIM_SEED', () => rewardSeeds.get('Claimed::SEED')],
    ])('%s', (constName, rustSeed) => {
        const declared = rustSeed();
        expect(declared, 'the Rust seed was not found — the parser or the program moved').toBeDefined();
        expect(tsSeed(constName)).toBe(declared);
    });

    // A parser that silently found nothing would make every case above vacuous.
    it('actually read seeds out of the program', () => {
        expect(petSeeds.size + itemSeeds.size + rewardSeeds.size).toBeGreaterThanOrEqual(8);
    });
});

describe('memcmp offsets match the PetAccount layout', () => {
    /** Borsh widths for the types `PetAccount` uses before `owner`. */
    const WIDTHS: Record<string, number> = { Pubkey: 32, u64: 8, i64: 8, u32: 4, u16: 2, u8: 1, bool: 1 };

    /** Byte offset of a `PetAccount` field, discriminator included. */
    function offsetOf(field: string): number {
        const source = readFileSync(join(CRYPTOPETS_STATE, 'pet.rs'), 'utf8');
        const body = source.split('pub struct PetAccount {')[1]!.split('\n}')[0]!;
        let offset = 8;
        for (const line of body.split('\n')) {
            const match = /^\s*pub (\w+): ([^,]+),/.exec(line);
            if (!match) continue;
            if (match[1] === field) return offset;
            const type = match[2]!.trim();
            const array = /^\[u8; ([^\]]+)\]$/.exec(type);
            // Only the fields before `owner` need resolving, and none of them is an array.
            offset += array ? Number.NaN : (WIDTHS[type] ?? Number.NaN);
            expect(offset, `unhandled type ${type} before ${field}`).not.toBeNaN();
        }
        throw new Error(`PetAccount has no field ${field}`);
    }

    const constants = readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '../../../src/utils/solana/constants.ts'),
        'utf8',
    );

    function tsOffset(name: string): number {
        const match = new RegExp(`${name} = (\\d+)`).exec(constants);
        expect(match, `${name} is not declared in constants.ts`).not.toBeNull();
        return Number(match![1]);
    }

    // `fetchAssetByPetId` filters on this. Wrong, and a cross-owner breed cannot resolve its
    // partner's asset, so the breed fails with "not found on-chain" for a pet that exists.
    it('finds the id where PetAccount declares it', () => {
        expect(tsOffset('PET_ACCOUNT_ID_MEMCMP_OFFSET')).toBe(offsetOf('id'));
    });

    // `usePets` filters on this. Wrong, and the gallery is empty for every wallet.
    it('finds the owner where PetAccount declares it', () => {
        expect(tsOffset('PET_ACCOUNT_OWNER_MEMCMP_OFFSET')).toBe(offsetOf('owner'));
    });
});
