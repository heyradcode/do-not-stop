import type { AnchorProvider } from '@coral-xyz/anchor';
import type { Randomness } from '@switchboard-xyz/on-demand';
import {
    Keypair,
    PublicKey,
    type Transaction,
    type TransactionInstruction,
    type VersionedTransaction,
} from '@solana/web3.js';

export const COMMIT_REVEAL_WAIT_MS = 3_000;
export const REVEAL_RETRIES = 5;
export const REVEAL_BACKOFF_MS = 2_000;

export async function sendSignedTx(
    provider: AnchorProvider,
    tx: Transaction | VersionedTransaction,
    extraSigners: Keypair[] = []
): Promise<string> {
    const connection = provider.connection;
    const signed = await provider.wallet.signTransaction(tx);
    if (extraSigners.length > 0) {
        if ('version' in signed) {
            signed.sign(extraSigners);
        } else {
            for (const signer of extraSigners) {
                (signed as Transaction).partialSign(signer);
            }
        }
    }
    const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
    });
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        'confirmed'
    );
    return sig;
}

export async function waitForRevealIx(
    randomness: Randomness,
    payer: PublicKey,
    maxRetries = REVEAL_RETRIES,
    backoffMs = REVEAL_BACKOFF_MS
): Promise<TransactionInstruction> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await randomness.revealIx(payer);
        } catch {
            if (attempt === maxRetries) {
                throw new Error('Switchboard oracle did not produce a reveal instruction in time');
            }
            await new Promise((r) => setTimeout(r, backoffMs));
        }
    }
    throw new Error('Switchboard oracle did not produce a reveal instruction');
}
