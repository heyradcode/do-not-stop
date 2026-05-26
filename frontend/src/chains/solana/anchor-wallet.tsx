import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { SolanaAnchorProvider, parseProgramId, type SolanaSigningWallet } from '@shared/core';
import { useDynamicSolanaWallet } from './useDynamicSolanaWallet';

/**
 * Supplies `SolanaAnchorProvider` with a signing wallet from wallet-adapter when connected,
 * otherwise from Dynamic (Phantom etc. opened via Dynamic’s modal are not on wallet-adapter).
 */
export function SolanaAnchorWallet({ children }: { children: ReactNode }) {
    const { connection } = useConnection();
    const adapterWallet = useAnchorWallet();
    const dynamicSolanaWallet = useDynamicSolanaWallet();
    const [dynamicSigningWallet, setDynamicSigningWallet] = useState<SolanaSigningWallet | null>(null);

    useEffect(() => {
        let cancelled = false;

        if (adapterWallet) {
            setDynamicSigningWallet(null);
            return;
        }

        if (!dynamicSolanaWallet?.address || typeof dynamicSolanaWallet.getSigner !== 'function') {
            setDynamicSigningWallet(null);
            return;
        }

        void (async () => {
            try {
                const signer = await dynamicSolanaWallet.getSigner!();
                if (cancelled) {
                    return;
                }
                if (!signer) {
                    setDynamicSigningWallet(null);
                    return;
                }
                setDynamicSigningWallet({
                    publicKey: new PublicKey(dynamicSolanaWallet.address),
                    signTransaction: (tx) => signer.signTransaction(tx),
                    signAllTransactions: (txs) => signer.signAllTransactions(txs),
                });
            } catch {
                if (!cancelled) {
                    setDynamicSigningWallet(null);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [adapterWallet, dynamicSolanaWallet]);

    const signingWallet = adapterWallet ?? dynamicSigningWallet;

    const programId = useMemo(
        () => parseProgramId(import.meta.env.VITE_CRYPTOPETS_PROGRAM_ID),
        []
    );

    return (
        <SolanaAnchorProvider connection={connection} programId={programId} signingWallet={signingWallet ?? null}>
            {children}
        </SolanaAnchorProvider>
    );
}

export default SolanaAnchorWallet;
