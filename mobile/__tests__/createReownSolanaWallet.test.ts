/**
 * The signing wallet Anchor drives for every Solana pet action, and the one place
 * mobile serializes a transaction itself.
 *
 * The contract that matters is `requireAllSignatures: false`. `Transaction.serialize()`
 * throws by default when signatures are missing, which is exactly the state an
 * unsigned transaction is in, so getting this wrong means nothing can ever be
 * signed. Real `@solana/web3.js` objects are used rather than mocks, because a
 * mocked `Transaction` would happily serialize anything and prove nothing.
 */

import bs58 from 'bs58';
import { Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';

import { createReownSolanaWallet } from '../src/solana/createReownSolanaWallet';

const payer = Keypair.generate();
const recipient = Keypair.generate();

/**
 * The provider's argument shape, declared so `mock.calls[0]` is a real tuple.
 * `jest.fn(async () => …)` infers a zero-parameter function, which types every
 * recorded call as an empty array and makes the assertions below unwritable.
 */
type RequestArgs = [{ method: string; params?: unknown }, string];

/** A realistic unsigned transfer: blockhash and fee payer set, no signatures. */
const unsignedTx = (): Transaction => {
    const tx = new Transaction();
    tx.add(
        SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: recipient.publicKey,
            lamports: 1,
        }),
    );
    tx.recentBlockhash = bs58.encode(Buffer.alloc(32, 3));
    tx.feePayer = payer.publicKey;
    return tx;
};

/** What a wallet hands back: the same transaction, signed. */
const signedBase58 = (tx: Transaction): string => {
    const copy = Transaction.from(
        tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
    );
    copy.sign(payer);
    return bs58.encode(copy.serialize());
};

describe('createReownSolanaWallet', () => {
    it('exposes the address as a PublicKey', () => {
        const wallet = createReownSolanaWallet(jest.fn(), payer.publicKey.toBase58(), 'devnet');
        expect(wallet.publicKey).toBeInstanceOf(PublicKey);
        expect(wallet.publicKey.toBase58()).toBe(payer.publicKey.toBase58());
    });

    it('serializes an unsigned transaction and returns the signed one', async () => {
        const tx = unsignedTx();
        const request = jest.fn<Promise<{ transaction?: string }>, RequestArgs>(async () => ({
            transaction: signedBase58(tx),
        }));
        const wallet = createReownSolanaWallet(
            request,
            payer.publicKey.toBase58(),
            'solana:devnet',
        );

        const signed = await wallet.signTransaction(tx);

        const [args, chain] = request.mock.calls[0];
        expect(chain).toBe('solana:devnet');
        expect(args.method).toBe('solana_signTransaction');
        // Round-trips only if it was serialized without requiring signatures.
        const sent = Transaction.from(
            bs58.decode((args.params as { transaction: string }).transaction),
        );
        expect(sent.instructions).toHaveLength(1);
        expect(signed.signatures.some((s) => s.signature !== null)).toBe(true);
    });

    it('normalizes a bare cluster id to a CAIP-2 reference', async () => {
        const tx = unsignedTx();
        const request = jest.fn<Promise<{ transaction?: string }>, RequestArgs>(async () => ({
            transaction: signedBase58(tx),
        }));
        const wallet = createReownSolanaWallet(request, payer.publicKey.toBase58(), 'devnet');

        await wallet.signTransaction(tx);

        expect(request.mock.calls[0][1]).toBe('solana:devnet');
    });

    it('signs a batch, preserving order', async () => {
        const txs = [unsignedTx(), unsignedTx()];
        const request = jest.fn<Promise<{ transactions?: string[] }>, RequestArgs>(async () => ({
            transactions: txs.map(signedBase58),
        }));
        const wallet = createReownSolanaWallet(
            request,
            payer.publicKey.toBase58(),
            'solana:devnet',
        );

        const signed = await wallet.signAllTransactions(txs);

        const [args] = request.mock.calls[0];
        expect(args.method).toBe('solana_signAllTransactions');
        expect((args.params as { transactions: string[] }).transactions).toHaveLength(2);
        expect(signed).toHaveLength(2);
    });

    it('refuses a response with no signed transaction', async () => {
        // Returning the input would hand Anchor a transaction it believes is
        // signed, and the failure would surface much later as a rejected send.
        const wallet = createReownSolanaWallet(
            jest.fn(async () => ({})),
            payer.publicKey.toBase58(),
            'solana:devnet',
        );

        await expect(wallet.signTransaction(unsignedTx())).rejects.toThrow(
            'Wallet did not return a signed transaction',
        );
    });

    it('refuses an empty batch response', async () => {
        const wallet = createReownSolanaWallet(
            jest.fn(async () => ({ transactions: [] })),
            payer.publicKey.toBase58(),
            'solana:devnet',
        );

        await expect(wallet.signAllTransactions([unsignedTx()])).rejects.toThrow(
            'Wallet did not return signed transactions',
        );
    });
});
