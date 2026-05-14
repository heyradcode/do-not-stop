import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

/** Minimal wallet surface required by Anchor `AnchorProvider` / `Program`. */
export type SolanaSigningWallet = {
    publicKey: PublicKey;
    signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
    signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
};

export type SolanaAnchorContextValue = {
    connection: Connection;
    programId: PublicKey | null;
    signingWallet: SolanaSigningWallet | null;
};

const SolanaAnchorContext = createContext<SolanaAnchorContextValue | null>(null);

export function useSolanaAnchor(): SolanaAnchorContextValue {
    const ctx = useContext(SolanaAnchorContext);
    if (!ctx) {
        throw new Error('useSolanaAnchor must be used within SolanaAnchorProvider');
    }
    return ctx;
}

export type SolanaAnchorProviderProps = {
    children: ReactNode;
    connection: Connection;
    programId: PublicKey | null;
    signingWallet: SolanaSigningWallet | null;
};

export function SolanaAnchorProvider({
    children,
    connection,
    programId,
    signingWallet,
}: SolanaAnchorProviderProps) {
    const value = useMemo(
        (): SolanaAnchorContextValue => ({
            connection,
            programId,
            signingWallet,
        }),
        [connection, programId, signingWallet]
    );

    return <SolanaAnchorContext.Provider value={value}>{children}</SolanaAnchorContext.Provider>;
}
