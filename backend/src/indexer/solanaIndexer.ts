import { AnchorProvider, Program, type Idl, type Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { upsertPet } from './rosterRepository';

export interface SolanaIndexerConfig {
    rpcUrl: string;
    programId: string;
}

/** A read-only wallet for the AnchorProvider — the indexer never signs. */
const READ_ONLY_WALLET: Wallet = {
    publicKey: PublicKey.default,
    payer: undefined as never,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => tx,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> =>
        txs,
};

type BNLike = { toString(): string };

function toNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (value && typeof (value as BNLike).toString === 'function') {
        return Number((value as BNLike).toString());
    }
    return 0;
}

function toBigIntString(value: unknown): string {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number') return Math.trunc(value).toString();
    if (value && typeof (value as BNLike).toString === 'function') {
        return (value as BNLike).toString();
    }
    return '0';
}

/** Decode the fixed 32-byte name buffer using nameLen, matching the on-chain layout. */
function decodeName(nameField: unknown, nameLen: unknown): string {
    const len = toNumber(nameLen);
    if (len <= 0) return '';

    let bytes: Uint8Array | null = null;
    if (nameField instanceof Uint8Array) {
        bytes = nameField;
    } else if (Array.isArray(nameField)) {
        bytes = Uint8Array.from(nameField as number[]);
    }
    if (!bytes) return '';

    return new TextDecoder().decode(bytes.subarray(0, Math.min(len, bytes.length)));
}

/**
 * Enumerate every PetAccount and upsert into `pet_roster` (PVP_BATTLE.md §2.3).
 *
 * Fetches the IDL on-chain (`Program.fetchIdl`, the same path the frontend uses
 * in `useProgram.ts`), then `program.account.petAccount.all()`. Requires the
 * program AND its IDL to be deployed on the target cluster.
 */
export async function scanSolanaRoster(
    config: SolanaIndexerConfig
): Promise<{ scanned: number }> {
    const connection = new Connection(config.rpcUrl, 'confirmed');
    const programId = new PublicKey(config.programId);
    const provider = new AnchorProvider(connection, READ_ONLY_WALLET, {
        commitment: 'confirmed',
    });

    const idl = await Program.fetchIdl(programId, provider);
    if (!idl) {
        throw new Error(
            `IDL not found on-chain for program ${config.programId}; deploy it with \`anchor idl init\``
        );
    }

    const program = new Program(idl as Idl, provider);

    // Anchor 0.30+ exposes camelCase account names; fall back to PascalCase.
    const accounts = program.account as Record<
        string,
        { all: () => Promise<{ publicKey: PublicKey; account: Record<string, unknown> }[]> } | undefined
    >;
    const petAccount = accounts.petAccount ?? accounts.PetAccount;
    if (!petAccount) {
        throw new Error('IDL has no petAccount account client');
    }

    const rows = await petAccount.all();
    let scanned = 0;

    for (const row of rows) {
        const a = row.account;
        const owner = a.owner instanceof PublicKey ? a.owner : new PublicKey(String(a.owner));

        await upsertPet({
            chain: 'solana',
            petId: String(toNumber(a.id)),
            owner: owner.toBase58(),
            name: decodeName(a.name, a.nameLen),
            level: toNumber(a.level),
            rarity: toNumber(a.rarity),
            dna: toBigIntString(a.dna),
            winCount: toNumber(a.winCount),
            lossCount: toNumber(a.lossCount),
            readyAt: BigInt(toBigIntString(a.readyTime)),
        });
        scanned++;
    }

    return { scanned };
}
