import { describe, expect, it, vi } from 'vitest';
import { base58Decode, isValidPubkey } from './base58.js';
import { UnknownPetError, UnsupportedChainError } from './chain.js';
import {
    FIELD_SIZES,
    PET_ACCOUNT_OFFSETS as OFFSET,
    PET_ACCOUNT_SPACE,
    SolanaPetReader,
    SolanaRpcError,
    decodePetAccount,
    petAccountDiscriminator,
} from './solana.js';

const ASSET = 'So11111111111111111111111111111111111111112';
const PROGRAM = 'CrYPtoPeTs1111111111111111111111111111111111';

const CONFIG = { rpcUrl: 'https://rpc.example', programId: PROGRAM };

/** Builds a PetAccount buffer from the same offset table the decoder reads. This
 *  cannot catch a wrong table, only a wrong decode, which is why the layout is
 *  pinned separately against the Rust SPACE constant below. */
const buildPetAccount = (overrides: Partial<{
    dna: bigint;
    rarity: number;
    level: number;
    winCount: number;
    lossCount: number;
    generation: number;
    speciesId: number;
    name: string;
}> = {}): Buffer => {
    const values = {
        dna: 7_934_056_188_134_207n,
        rarity: 3,
        level: 4,
        winCount: 3,
        lossCount: 1,
        generation: 1,
        speciesId: 0,
        name: 'Sparky',
        ...overrides,
    };

    const data = Buffer.alloc(PET_ACCOUNT_SPACE);
    petAccountDiscriminator().copy(data, 0);
    data.writeBigUInt64LE(values.dna, OFFSET.dna!);
    data.writeUInt8(values.rarity, OFFSET.rarity!);
    data.writeUInt16LE(values.level, OFFSET.level!);
    data.writeUInt16LE(values.winCount, OFFSET.winCount!);
    data.writeUInt16LE(values.lossCount, OFFSET.lossCount!);
    data.writeUInt8(values.generation, OFFSET.generation!);
    data.writeUInt16LE(values.speciesId, OFFSET.speciesId!);
    const name = Buffer.from(values.name, 'utf8');
    name.copy(data, OFFSET.name!);
    data.writeUInt8(name.length, OFFSET.nameLen!);
    return data;
};

const rpcReturning = (result: unknown): typeof fetch =>
    vi.fn(async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
        headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

const accountsFor = (data: Buffer) => [{ account: { data: [data.toString('base64'), 'base64'] } }];

describe('PetAccount layout', () => {
    // Pinned against contracts/solana/.../state/pet.rs's PetAccount::SPACE. If
    // this fails the Rust struct changed, and every offset below it has moved.
    it('totals the 224 bytes the Rust SPACE constant declares', () => {
        expect(PET_ACCOUNT_SPACE).toBe(224);
    });

    it('places the fields the decoder reads where the Rust struct puts them', () => {
        expect(OFFSET.discriminator).toBe(0);
        expect(OFFSET.id).toBe(8);
        expect(OFFSET.owner).toBe(12);
        expect(OFFSET.dna).toBe(44);
        expect(OFFSET.rarity).toBe(52);
        expect(OFFSET.name).toBe(69);
        expect(OFFSET.speciesId).toBe(138);
        expect(OFFSET.asset).toBe(184);
    });

    it('transcribes every field, so no gap is silently skipped', () => {
        expect(FIELD_SIZES.reduce((sum, [, bytes]) => sum + bytes, 0)).toBe(PET_ACCOUNT_SPACE);
    });
});

describe('decodePetAccount', () => {
    it('decodes the fields art and metadata need', () => {
        const pet = decodePetAccount(buildPetAccount({ speciesId: 5 }), ASSET);

        expect(pet).toEqual({
            tokenId: ASSET,
            name: 'Sparky',
            dna: 7_934_056_188_134_207n,
            rarity: 3,
            speciesId: 5,
            level: 4,
            generation: 1,
            winCount: 3,
            lossCount: 1,
        });
    });

    // species_id is 0 until species pools land on Solana. Passing that through as
    // a real species would give every Solana pet the same body.
    it('treats species 0 as unset, so the body falls back to DNA', () => {
        expect(decodePetAccount(buildPetAccount({ speciesId: 0 }), ASSET).speciesId).toBeUndefined();
    });

    it('keeps species 1 and up, which are real', () => {
        expect(decodePetAccount(buildPetAccount({ speciesId: 1 }), ASSET).speciesId).toBe(1);
    });

    it('reads the name to its stored length, not the whole padded field', () => {
        expect(decodePetAccount(buildPetAccount({ name: 'Ada' }), ASSET).name).toBe('Ada');
        expect(decodePetAccount(buildPetAccount({ name: '' }), ASSET).name).toBe('');
        expect(decodePetAccount(buildPetAccount({ name: 'x'.repeat(32) }), ASSET).name).toHaveLength(32);
    });

    it('rejects an account that is not a PetAccount', () => {
        const data = buildPetAccount();
        data.writeUInt8(0xff, 0); // corrupt the discriminator
        expect(() => decodePetAccount(data, ASSET)).toThrow(/discriminator mismatch/);
    });

    it('rejects a short buffer rather than reading past the end', () => {
        expect(() => decodePetAccount(buildPetAccount().subarray(0, 100), ASSET))
            .toThrow(/offset table in solana.ts is stale/);
    });
});

describe('SolanaPetReader', () => {
    it('filters getProgramAccounts by size and asset, and decodes the hit', async () => {
        const fetchImpl = rpcReturning(accountsFor(buildPetAccount()));
        const pet = await new SolanaPetReader(CONFIG, fetchImpl).read('solana', ASSET);

        expect(pet.tokenId).toBe(ASSET);
        expect(pet.dna).toBe(7_934_056_188_134_207n);

        const body = JSON.parse(vi.mocked(fetchImpl).mock.calls[0]![1]!.body as string);
        expect(body.method).toBe('getProgramAccounts');
        expect(body.params[0]).toBe(PROGRAM);
        expect(body.params[1].filters).toEqual([
            { dataSize: 224 },
            { memcmp: { offset: 184, bytes: ASSET } },
        ]);
    });

    it('reports a pet with no matching account as unknown', async () => {
        const reader = new SolanaPetReader(CONFIG, rpcReturning([]));
        await expect(reader.read('solana', ASSET)).rejects.toThrow(UnknownPetError);
    });

    it('rejects a non-pubkey identifier without calling the RPC', async () => {
        const fetchImpl = rpcReturning([]);
        const reader = new SolanaPetReader(CONFIG, fetchImpl);

        // An EVM decimal id routed at /image/solana/... must not reach the cluster.
        await expect(reader.read('solana', '7')).rejects.toThrow(UnknownPetError);
        await expect(reader.read('solana', 'not-base58!')).rejects.toThrow(UnknownPetError);
        expect(vi.mocked(fetchImpl)).not.toHaveBeenCalled();
    });

    it('rejects a chain it does not own', async () => {
        const reader = new SolanaPetReader(CONFIG, rpcReturning([]));
        await expect(reader.read('evm', ASSET)).rejects.toThrow(UnsupportedChainError);
    });

    // A provider that disables getProgramAccounts must not look like "no such pet",
    // or the service would 404 every Solana pet and nobody would know why.
    it('surfaces an RPC-level error instead of reporting a missing pet', async () => {
        const fetchImpl = vi.fn(async () => new Response(
            JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'method disabled' } }),
            { headers: { 'content-type': 'application/json' } },
        )) as unknown as typeof fetch;

        const reader = new SolanaPetReader(CONFIG, fetchImpl);
        await expect(reader.read('solana', ASSET)).rejects.toThrow(SolanaRpcError);
        await expect(reader.read('solana', ASSET)).rejects.toThrow(/method disabled/);
    });

    it('surfaces an HTTP failure', async () => {
        const fetchImpl = vi.fn(async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;
        await expect(new SolanaPetReader(CONFIG, fetchImpl).read('solana', ASSET))
            .rejects.toThrow(/HTTP 503/);
    });
});

describe('base58Decode', () => {
    it('decodes a pubkey to 32 bytes', () => {
        expect(base58Decode(ASSET)).toHaveLength(32);
        expect(isValidPubkey(ASSET)).toBe(true);
    });

    it('round-trips a known vector', () => {
        // The system program, all zero bytes, encodes as a run of '1's.
        expect(base58Decode('11111111111111111111111111111111')?.equals(Buffer.alloc(32))).toBe(true);
    });

    it('preserves leading zero bytes, which the arithmetic alone would drop', () => {
        expect(base58Decode('1')?.equals(Buffer.from([0]))).toBe(true);
        expect(base58Decode('112')?.equals(Buffer.from([0, 0, 1]))).toBe(true);
    });

    it('rejects characters outside the alphabet, including the lookalikes', () => {
        for (const value of ['0', 'O', 'I', 'l', 'hello world', '', 'abc!']) {
            expect(base58Decode(value)).toBeNull();
        }
    });

    it('rejects anything that is not exactly 32 bytes as a pubkey', () => {
        expect(isValidPubkey('1')).toBe(false);
        expect(isValidPubkey('7')).toBe(false);
        expect(isValidPubkey(`${ASSET}11`)).toBe(false);
    });
});
