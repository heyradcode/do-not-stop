import { beforeEach, describe, expect, it, vi } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const getAccountInfo = vi.fn();
const sendAndConfirmTransaction = vi.fn();

vi.mock('@solana/web3.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@solana/web3.js')>();
    return {
        ...actual,
        // Only the two network-touching pieces are faked. PublicKey, Keypair, Transaction
        // and TransactionInstruction stay real, because PDA derivation and instruction
        // assembly are exactly what this suite is checking.
        Connection: class {
            constructor(
                public endpoint: string,
                public commitment: string,
            ) {}
            getAccountInfo = getAccountInfo;
        },
        sendAndConfirmTransaction: (...args: unknown[]) => sendAndConfirmTransaction(...args),
    };
});

const { PublicKey, SystemProgram } = await import('@solana/web3.js');
const { createSolanaAnchorClient, keypairFrom, ZERO_ROOT } = await import('@features/battle/anchor');

/**
 * The Solana anchoring client.
 *
 * Everything here is a hand-transcription of the `cryptopets_registry` program: account
 * offsets, Anchor discriminators, argument order, and the account list. None of it fails to
 * compile if the program changes, so the discriminators below are pinned as literal bytes
 * rather than recomputed the same way the implementation computes them. A test that derived
 * them from the same string would pass for a wrong namespace or a camelCased name.
 */

// sha256("global:publish_batch")[0..8] and sha256("account:RegistryState")[0..8].
const PUBLISH_BATCH_IX = Buffer.from('366d4ea16ff06126', 'hex');
const REGISTRY_STATE_DISC = Buffer.from('1d22e0c3afb76361', 'hex');

const PROGRAM_ID = 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS';
const ROOT_1 = `0x${'11'.repeat(32)}` as const;
const ROOT_2 = `0x${'22'.repeat(32)}` as const;
const RULESET_SET = `0x${'aa'.repeat(32)}` as const;
const SIGNATURE = '5'.repeat(87);

/** A deterministic keypair, so nothing here depends on randomness. */
function testSecretKey(): Uint8Array {
    return nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(7)).secretKey;
}

function config() {
    return {
        kind: 'solana' as const,
        rpcUrl: 'http://127.0.0.1:8899',
        privateKey: bs58.encode(testSecretKey()),
        registryAddress: PROGRAM_ID,
    };
}

/** A synthetic `RegistryState` account, laid out as `state.rs` declares it. */
function registryState(
    latestBatchNumber: bigint,
    latestRoot: string,
    { discriminator = REGISTRY_STATE_DISC, space = 154 } = {},
) {
    // Written into a full-size buffer first, then truncated, so a `space` shorter than the
    // layout stays a valid test fixture instead of an out-of-range write.
    const full = Buffer.alloc(154);
    discriminator.copy(full, 0);
    Buffer.alloc(32).copy(full, 8); // admin
    full.writeBigUInt64LE(latestBatchNumber, 40);
    Buffer.from(latestRoot.slice(2), 'hex').copy(full, 48);
    full.writeBigUInt64LE(0n, 80); // latest_last_sequence
    return { data: full.subarray(0, space) };
}

const commitment = {
    batchNumber: 7n,
    previousRoot: ROOT_1,
    merkleRoot: ROOT_2,
    rulesetSetHash: RULESET_SET,
    firstSequence: 601n,
    lastSequence: 700n,
};

beforeEach(() => {
    vi.clearAllMocks();
    sendAndConfirmTransaction.mockResolvedValue(SIGNATURE);
});

describe('reading the head', () => {
    it('decodes the batch number and root', async () => {
        getAccountInfo.mockResolvedValue(registryState(4n, ROOT_1));

        await expect(createSolanaAnchorClient(config()).readHead()).resolves.toEqual({
            batchNumber: 4n,
            root: ROOT_1,
        });
    });

    it('reads a fresh registry as batch zero against the zero root', async () => {
        getAccountInfo.mockResolvedValue(registryState(0n, ZERO_ROOT));

        const head = await createSolanaAnchorClient(config()).readHead();

        expect(head.batchNumber).toBe(0n);
        expect(head.root).toBe(ZERO_ROOT);
    });

    it('reads the registry PDA, not an address the caller chose', async () => {
        getAccountInfo.mockResolvedValue(registryState(0n, ZERO_ROOT));
        const [expected] = PublicKey.findProgramAddressSync(
            [Buffer.from('registry')],
            new PublicKey(PROGRAM_ID),
        );

        await createSolanaAnchorClient(config()).readHead();

        expect(getAccountInfo.mock.calls[0]![0].toBase58()).toBe(expected.toBase58());
    });

    it('fails loudly when the registry has not been initialized', async () => {
        getAccountInfo.mockResolvedValue(null);

        await expect(createSolanaAnchorClient(config()).readHead()).rejects.toThrow(/does not exist/);
    });

    // Wrong program id, or a layout that moved. Decoding on would produce a plausible head
    // from unrelated bytes, and the service would trust it.
    it('refuses an account that is not a RegistryState', async () => {
        getAccountInfo.mockResolvedValue(
            registryState(4n, ROOT_1, { discriminator: Buffer.alloc(8, 0xff) }),
        );

        await expect(createSolanaAnchorClient(config()).readHead()).rejects.toThrow(
            /not a RegistryState/,
        );
    });

    it('refuses an account shorter than the declared space', async () => {
        getAccountInfo.mockResolvedValue(registryState(4n, ROOT_1, { space: 80 }));

        await expect(createSolanaAnchorClient(config()).readHead()).rejects.toThrow(/expected at least/);
    });
});

describe('publishing a batch', () => {
    async function publishAndCapture() {
        await createSolanaAnchorClient(config()).publishBatch(commitment);
        const tx = sendAndConfirmTransaction.mock.calls[0]![1] as {
            instructions: { programId: unknown; keys: { pubkey: unknown; isSigner: boolean; isWritable: boolean }[]; data: Buffer }[];
        };
        return tx.instructions[0]!;
    }

    it('returns the signature as the transaction hash', async () => {
        await expect(createSolanaAnchorClient(config()).publishBatch(commitment)).resolves.toEqual({
            txHash: SIGNATURE,
        });
    });

    it('prefixes the data with the publish_batch discriminator', async () => {
        const ix = await publishAndCapture();

        expect(ix.data.subarray(0, 8)).toEqual(PUBLISH_BATCH_IX);
    });

    // The order and widths the program's Borsh reader expects. Getting either wrong builds a
    // transaction that fails on chain, or worse, anchors the wrong numbers.
    it('encodes the arguments in declaration order', async () => {
        const ix = await publishAndCapture();
        const args = ix.data.subarray(8);

        expect(args).toHaveLength(8 + 32 + 32 + 32 + 8 + 8);
        expect(args.readBigUInt64LE(0)).toBe(7n);
        expect(`0x${args.subarray(8, 40).toString('hex')}`).toBe(ROOT_1);
        expect(`0x${args.subarray(40, 72).toString('hex')}`).toBe(ROOT_2);
        expect(`0x${args.subarray(72, 104).toString('hex')}`).toBe(RULESET_SET);
        expect(args.readBigUInt64LE(104)).toBe(601n);
        expect(args.readBigUInt64LE(112)).toBe(700n);
    });

    it('passes the accounts in the order PublishBatch declares them', async () => {
        const ix = await publishAndCapture();
        const programId = new PublicKey(PROGRAM_ID);
        const publisher = keypairFrom(config().privateKey).publicKey;

        const [registry] = PublicKey.findProgramAddressSync([Buffer.from('registry')], programId);
        const [record] = PublicKey.findProgramAddressSync(
            [Buffer.from('publisher'), publisher.toBuffer()],
            programId,
        );
        const batchSeed = Buffer.alloc(8);
        batchSeed.writeBigUInt64LE(7n);
        const [batch] = PublicKey.findProgramAddressSync(
            [Buffer.from('batch'), batchSeed],
            programId,
        );

        expect(ix.keys.map((k) => String(k.pubkey))).toEqual([
            registry.toBase58(),
            publisher.toBase58(),
            record.toBase58(),
            batch.toBase58(),
            SystemProgram.programId.toBase58(),
        ]);
        expect(ix.keys.map((k) => k.isSigner)).toEqual([false, true, false, false, false]);
        expect(ix.keys.map((k) => k.isWritable)).toEqual([true, true, false, true, false]);
    });

    // A batch is the immutability claim. Anchoring against a slot that can still be dropped
    // would defeat it, so nothing here may settle for `confirmed`.
    it('waits for finality rather than confirmation', async () => {
        await createSolanaAnchorClient(config()).publishBatch(commitment);

        const options = sendAndConfirmTransaction.mock.calls[0]![3] as { commitment: string };
        expect(options.commitment).toBe('finalized');
    });

    it('propagates a send failure rather than reporting a hash', async () => {
        sendAndConfirmTransaction.mockRejectedValue(new Error('blockhash not found'));

        await expect(
            createSolanaAnchorClient(config()).publishBatch(commitment),
        ).rejects.toThrow('blockhash not found');
    });

    it('rejects a root that is not 32 bytes rather than padding it', async () => {
        await expect(
            createSolanaAnchorClient(config()).publishBatch({ ...commitment, merkleRoot: '0xdead' }),
        ).rejects.toThrow(/32-byte root/);
    });
});

describe('decoding the publisher key', () => {
    it('accepts a base58 secret key', () => {
        const keypair = keypairFrom(bs58.encode(testSecretKey()));
        expect(keypair.secretKey).toEqual(testSecretKey());
    });

    // What solana-keygen writes to a file, which is what an operator is most likely to have.
    it('accepts a JSON byte array', () => {
        const keypair = keypairFrom(JSON.stringify(Array.from(testSecretKey())));
        expect(keypair.secretKey).toEqual(testSecretKey());
    });

    it('tolerates surrounding whitespace', () => {
        const keypair = keypairFrom(`  ${bs58.encode(testSecretKey())}\n`);
        expect(keypair.secretKey).toEqual(testSecretKey());
    });
});
