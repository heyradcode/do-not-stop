import type { AnchorProvider } from '@coral-xyz/anchor';
import type { Randomness } from '@switchboard-xyz/on-demand';
import {
    Keypair,
    PublicKey,
    type Transaction,
    type TransactionInstruction,
    type VersionedTransaction,
} from '@solana/web3.js';
import { sleep } from '../common';

export const COMMIT_REVEAL_WAIT_MS = 3_000;
export const REVEAL_RETRIES = 5;
export const REVEAL_BACKOFF_MS = 2_000;

/** Switchboard VRF needs commit → (wait) → reveal; two wallet signatures is the minimum. */

const recentBlockhashFromTx = (tx: Transaction | VersionedTransaction): string | undefined  => {
    if ('version' in tx) {
        return tx.message.recentBlockhash;
    }
    return (tx as Transaction).recentBlockhash ?? undefined;
}

/** Local keypairs sign before the wallet so PDAs / new accounts are valid at sign time. */
const applyExtraSigners = (
    tx: Transaction | VersionedTransaction,
    extraSigners: Keypair[]
): void  => {
    if (extraSigners.length === 0) return;
    if ('version' in tx) {
        tx.sign(extraSigners);
        return;
    }
    for (const signer of extraSigners) {
        (tx as Transaction).partialSign(signer);
    }
}

export const sendSignedTx = async (
    provider: AnchorProvider,
    tx: Transaction | VersionedTransaction,
    extraSigners: Keypair[] = []
): Promise<string> => {
    const connection = provider.connection;

    applyExtraSigners(tx, extraSigners);
    const signed = await provider.wallet.signTransaction(tx);

    const blockhash = recentBlockhashFromTx(signed);
    if (!blockhash) {
        throw new Error('Transaction is missing a recent blockhash');
    }

    const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
    });

    await connection.confirmTransaction(sig, 'confirmed');
    return sig;
}

export const waitForRevealIx = async (
    randomness: Randomness,
    payer: PublicKey,
    maxRetries = REVEAL_RETRIES,
    backoffMs = REVEAL_BACKOFF_MS
): Promise<TransactionInstruction> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await randomness.revealIx(payer);
        } catch {
            if (attempt === maxRetries) {
                throw new Error('Switchboard oracle did not produce a reveal instruction in time');
            }
            await sleep(backoffMs);
        }
    }
    throw new Error('Switchboard oracle did not produce a reveal instruction');
}
