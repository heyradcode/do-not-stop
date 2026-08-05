import { Buffer } from 'buffer';
import { describe, expect, it, vi } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import type { Idl, Program } from '@coral-xyz/anchor';

import {
    fetchAssetByPetId,
    fetchMarriageOwnerSnapshot,
    getAccountClient,
} from '../../../src/utils/solana/accountClient';
import { PET_ACCOUNT_ID_MEMCMP_OFFSET } from '../../../src/utils/solana/constants';
import { petPdaByAsset } from '../../../src/utils/solana/pdas';

/**
 * Every failure mode in this module is silent. A missed PascalCase fallback throws
 * on the first read; a mishandled zero pubkey hands back `PublicKey.default` as a
 * spouse, which is then the `parent2Owner` a cross-owner breed pays its stud fee to;
 * a wrong memcmp filter simply finds no pet.
 *
 * `program` is only ever used as an account-namespace lookup, so a plain object
 * stands in for it and no Solana connection is involved.
 */
const programId = Keypair.generate().publicKey;

/** Minimal stand-in for an Anchor `Program`, with the account namespace under `key`. */
const fakeProgram = (key: string, client: Record<string, unknown>) =>
    ({ account: { [key]: client } } as unknown as Program<Idl>);

describe('getAccountClient', () => {
    it('resolves the camelCase account name Anchor 0.31+ emits', () => {
        const client = { fetch: vi.fn(), fetchNullable: vi.fn(), all: vi.fn() };
        expect(getAccountClient(fakeProgram('petAccount', client), 'petAccount')).toBe(client);
    });

    // Older IDLs used PascalCase. Losing this fallback breaks every Solana read
    // against a program whose IDL predates the rename.
    it('falls back to the PascalCase name older IDLs used', () => {
        const client = { fetch: vi.fn(), fetchNullable: vi.fn(), all: vi.fn() };
        expect(getAccountClient(fakeProgram('PetAccount', client), 'petAccount')).toBe(client);
    });

    it('names the missing account when the IDL has neither', () => {
        expect(() => getAccountClient(fakeProgram('somethingElse', {}), 'petAccount'))
            .toThrow(/petAccount/);
    });
});

describe('fetchMarriageOwnerSnapshot', () => {
    const asset = Keypair.generate().publicKey;

    const withAccount = (account: unknown) => {
        const fetchNullable = vi.fn().mockResolvedValue(account);
        return { program: fakeProgram('petAccount', { fetchNullable }), fetchNullable };
    };

    it('reads the pet account at the PDA derived from the asset key', async () => {
        const { program, fetchNullable } = withAccount(null);
        await fetchMarriageOwnerSnapshot(program, programId, asset);

        const [expectedPda] = petPdaByAsset(programId, asset.toBase58());
        expect(fetchNullable).toHaveBeenCalledTimes(1);
        expect((fetchNullable.mock.calls[0]?.[0] as PublicKey).toBase58()).toBe(expectedPda.toBase58());
    });

    it('returns null when the pet account does not exist', async () => {
        const { program } = withAccount(null);
        await expect(fetchMarriageOwnerSnapshot(program, programId, asset)).resolves.toBeNull();
    });

    // The zero pubkey is how the program spells "not married". Returning it would put
    // the system-program address in front of a stud-fee transfer.
    it('treats the zero pubkey as not married', async () => {
        const { program } = withAccount({ marriageOwnerSnapshot: PublicKey.default });
        await expect(fetchMarriageOwnerSnapshot(program, programId, asset)).resolves.toBeNull();
    });

    it('returns null when the field is absent or not a pubkey', async () => {
        await expect(fetchMarriageOwnerSnapshot(withAccount({}).program, programId, asset))
            .resolves.toBeNull();
        await expect(
            fetchMarriageOwnerSnapshot(
                withAccount({ marriageOwnerSnapshot: 'not-a-pubkey' }).program, programId, asset,
            ),
        ).resolves.toBeNull();
    });

    it('returns the spouse wallet when one is recorded', async () => {
        const spouse = Keypair.generate().publicKey;
        const { program } = withAccount({ marriageOwnerSnapshot: spouse });
        const got = await fetchMarriageOwnerSnapshot(program, programId, asset);
        expect(got?.toBase58()).toBe(spouse.toBase58());
    });
});

describe('fetchAssetByPetId', () => {
    const withRows = (rows: unknown[]) => {
        const all = vi.fn().mockResolvedValue(rows);
        return { program: fakeProgram('petAccount', { all }), all };
    };

    /**
     * The filter has to match the on-chain bytes exactly: `id` is a u32 written
     * little-endian, at the offset just past the 8-byte discriminator. Either detail
     * wrong and the query returns nothing rather than erroring.
     */
    it('filters on the id as a little-endian u32 at the discriminator offset', async () => {
        const { program, all } = withRows([]);
        await fetchAssetByPetId(program, 0x01020304);

        const le = Buffer.alloc(4);
        le.writeUInt32LE(0x01020304, 0);
        expect(all).toHaveBeenCalledWith([{
            memcmp: { offset: PET_ACCOUNT_ID_MEMCMP_OFFSET, bytes: bs58.encode(le) },
        }]);
    });

    it('returns null when no pet carries that id', async () => {
        const { program } = withRows([]);
        await expect(fetchAssetByPetId(program, 1)).resolves.toBeNull();
    });

    it('returns null when the matched row has no asset', async () => {
        await expect(fetchAssetByPetId(withRows([{ account: {} }]).program, 1)).resolves.toBeNull();
        await expect(
            fetchAssetByPetId(withRows([{ account: { asset: 'not-a-pubkey' } }]).program, 1),
        ).resolves.toBeNull();
    });

    it('returns the Core asset address of the first match', async () => {
        const asset = Keypair.generate().publicKey;
        const { program } = withRows([{ publicKey: programId, account: { asset } }]);
        const got = await fetchAssetByPetId(program, 7);
        expect(got?.toBase58()).toBe(asset.toBase58());
    });
});
