import { createHash } from 'node:crypto';

import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';

import type { SolanaAnchorConfig } from '@config/env';

import type { BatchAnchorClient, BatchCommitment, RegistryHead, RootHex } from './client';

/**
 * `BatchAnchorClient` over the `cryptopets_registry` Anchor program (§I).
 *
 * **Hand-encoded rather than driven by an IDL**, matching how `abi.ts` declares the EVM
 * registry: the backend does not build the programs, and depending on a generated IDL would
 * couple deploys of one to builds of the other. Anchor 0.30+ can fetch an IDL from chain
 * instead, but that adds a network round trip to every boot and a deploy step
 * (`anchor idl init`) that can be forgotten, to decode a layout that is 154 fixed bytes.
 *
 * The cost is that this file is a transcription. If `RegistryState`'s fields or
 * `publish_batch`'s arguments change, nothing here fails to compile: it decodes garbage or
 * builds an instruction the program rejects. `ACCOUNT_DISCRIMINATOR` is the guard that turns
 * the first case into a loud error, and the registry's upgrade authority being burned is
 * what makes the layout stable enough for this trade to be sound.
 */

/** Seeds, transcribed from `programs/cryptopets-registry/src/state.rs`. */
const REGISTRY_SEED = Buffer.from('registry');
const PUBLISHER_SEED = Buffer.from('publisher');
const BATCH_SEED = Buffer.from('batch');

/**
 * Anchor's discriminators: the first 8 bytes of `sha256("<namespace>:<name>")`.
 *
 * `global` for instructions, `account` for account types. The instruction name is the
 * snake_case Rust function name, and the account name is the PascalCase struct name.
 */
function discriminator(namespace: 'global' | 'account', name: string): Buffer {
    return createHash('sha256').update(`${namespace}:${name}`).digest().subarray(0, 8);
}

const PUBLISH_BATCH_IX = discriminator('global', 'publish_batch');
const REGISTRY_STATE_ACCOUNT = discriminator('account', 'RegistryState');

/** `RegistryState` field offsets, after the 8-byte discriminator. */
const OFFSET = {
    admin: 8,
    latestBatchNumber: 40,
    latestRoot: 48,
    latestLastSequence: 80,
    paused: 88,
} as const;

/** Total `RegistryState::SPACE`. A shorter account means we are reading the wrong thing. */
const REGISTRY_STATE_SPACE = 154;

function u64le(value: bigint): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(value);
    return buf;
}

/** `0x`-prefixed lowercase hex, the normalized form `RegistryHead.root` promises. */
function toRootHex(bytes: Buffer): RootHex {
    return `0x${bytes.toString('hex')}`;
}

/** The inverse: a 32-byte root from the hex the batch table stores. */
function fromRootHex(root: RootHex): Buffer {
    const bytes = Buffer.from(root.slice(2), 'hex');
    if (bytes.length !== 32) {
        throw new Error(`expected a 32-byte root, got ${bytes.length} bytes from ${root}`);
    }
    return bytes;
}

/**
 * Decodes a publisher secret key.
 *
 * Accepts base58 (what most tooling prints) and a JSON byte array (what `solana-keygen`
 * writes to a file), because an operator will paste whichever one they have and a silent
 * mismatch here means a wallet nobody funded.
 */
export function keypairFrom(privateKey: string): Keypair {
    const trimmed = privateKey.trim();
    if (trimmed.startsWith('[')) {
        return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed) as number[]));
    }
    return Keypair.fromSecretKey(bs58.decode(trimmed));
}

export function createSolanaAnchorClient(config: SolanaAnchorConfig): BatchAnchorClient {
    // `finalized`, not `confirmed`, for both reads and the send. A batch is the immutability
    // claim; anchoring against a slot that can still be dropped would defeat it, and reading
    // a head from a droppable slot could make us skip a batch that never really landed.
    const connection = new Connection(config.rpcUrl, 'finalized');
    const programId = new PublicKey(config.registryAddress);
    const publisher = keypairFrom(config.privateKey);

    const [registryPda] = PublicKey.findProgramAddressSync([REGISTRY_SEED], programId);
    const [publisherPda] = PublicKey.findProgramAddressSync(
        [PUBLISHER_SEED, publisher.publicKey.toBuffer()],
        programId,
    );

    return {
        async readHead(): Promise<RegistryHead> {
            const account = await connection.getAccountInfo(registryPda);
            if (!account) {
                throw new Error(
                    `registry ${registryPda.toBase58()} does not exist; run initialize on ${config.registryAddress}`,
                );
            }
            if (account.data.length < REGISTRY_STATE_SPACE) {
                throw new Error(
                    `registry account is ${account.data.length} bytes, expected at least ${REGISTRY_STATE_SPACE}`,
                );
            }
            if (!account.data.subarray(0, 8).equals(REGISTRY_STATE_ACCOUNT)) {
                // Wrong program id, or a layout that moved under us. Either way, decoding on
                // would produce a plausible-looking head from unrelated bytes.
                throw new Error(`account ${registryPda.toBase58()} is not a RegistryState`);
            }

            return {
                batchNumber: account.data.readBigUInt64LE(OFFSET.latestBatchNumber),
                root: toRootHex(account.data.subarray(OFFSET.latestRoot, OFFSET.latestRoot + 32)),
            };
        },

        /**
         * Sends `publish_batch` and waits for finality.
         *
         * Not idempotent on its own, and it does not need to be. A send that times out may
         * still land, but the caller reads the head before every attempt and reconciles a
         * batch it finds already anchored, and the program's `init` on the batch PDA rejects
         * a genuine second publish. Solana bounds the ambiguity better than EVM does here:
         * a blockhash expires in roughly a minute, so a timed-out transaction either landed
         * within that window or never will, rather than sitting in a mempool for hours.
         */
        async publishBatch(batch: BatchCommitment): Promise<{ txHash: string }> {
            const [batchPda] = PublicKey.findProgramAddressSync(
                [BATCH_SEED, u64le(batch.batchNumber)],
                programId,
            );

            const data = Buffer.concat([
                PUBLISH_BATCH_IX,
                u64le(batch.batchNumber),
                fromRootHex(batch.previousRoot),
                fromRootHex(batch.merkleRoot),
                fromRootHex(batch.rulesetSetHash),
                u64le(batch.firstSequence),
                u64le(batch.lastSequence),
            ]);

            // Order matters and is not checked by anything: it must match the field order of
            // `#[derive(Accounts)] pub struct PublishBatch` exactly.
            const instruction = new TransactionInstruction({
                programId,
                keys: [
                    { pubkey: registryPda, isSigner: false, isWritable: true },
                    { pubkey: publisher.publicKey, isSigner: true, isWritable: true },
                    { pubkey: publisherPda, isSigner: false, isWritable: false },
                    { pubkey: batchPda, isSigner: false, isWritable: true },
                    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                ],
                data,
            });

            const signature = await sendAndConfirmTransaction(
                connection,
                new Transaction().add(instruction),
                [publisher],
                { commitment: 'finalized' },
            );
            return { txHash: signature };
        },
    };
}
