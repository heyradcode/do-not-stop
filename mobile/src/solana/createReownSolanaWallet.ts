import bs58 from 'bs58';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import type { SolanaSigningWallet } from '@shared/core';

import { solanaProviderChainRef } from '../utils/solanaProviderChainRef';

type ProviderRequest = (args: { method: string; params?: unknown }, chain: string) => Promise<unknown>;

function serializeUnsigned(tx: Transaction | VersionedTransaction): string {
    if (tx instanceof VersionedTransaction) {
        return bs58.encode(tx.serialize());
    }
    return bs58.encode(
        tx.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        })
    );
}

/** Wraps Reown AppKit `provider.request` as an Anchor-compatible signing wallet. */
export function createReownSolanaWallet(
    request: ProviderRequest,
    address: string,
    chainId: string | number
): SolanaSigningWallet {
    const publicKey = new PublicKey(address);
    const chain = solanaProviderChainRef(chainId);

    return {
        publicKey,
        signTransaction: async (tx) => {
            const params = { transaction: serializeUnsigned(tx) };
            const result = (await request({ method: 'solana_signTransaction', params }, chain)) as {
                transaction?: string;
            };
            if (!result.transaction) {
                throw new Error('Wallet did not return a signed transaction');
            }
            const decoded = bs58.decode(result.transaction);
            if (tx instanceof VersionedTransaction) {
                return VersionedTransaction.deserialize(decoded) as typeof tx;
            }
            return Transaction.from(decoded) as typeof tx;
        },
        signAllTransactions: async (txs) => {
            const serialized = txs.map((t) => serializeUnsigned(t));
            const result = (await request(
                { method: 'solana_signAllTransactions', params: { transactions: serialized } },
                chain
            )) as { transactions?: string[] };
            if (!result.transactions?.length) {
                throw new Error('Wallet did not return signed transactions');
            }
            return txs.map((tx, i) => {
                const decoded = bs58.decode(result.transactions![i]);
                if (tx instanceof VersionedTransaction) {
                    return VersionedTransaction.deserialize(decoded) as typeof tx;
                }
                return Transaction.from(decoded) as typeof tx;
            });
        },
    };
}
