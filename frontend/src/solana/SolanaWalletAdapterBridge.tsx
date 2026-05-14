import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { useMemo, type ReactNode } from 'react';
import { SolanaAnchorProvider, parseProgramId } from '@shared/core';

/** Bridges `@solana/wallet-adapter-react` into `@shared/core` Solana hooks. */
export function SolanaWalletAdapterBridge({ children }: { children: ReactNode }) {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();
    const programId = useMemo(
        () => parseProgramId(import.meta.env.VITE_CRYPTOPETS_PROGRAM_ID),
        []
    );

    return (
        <SolanaAnchorProvider connection={connection} programId={programId} signingWallet={wallet ?? null}>
            {children}
        </SolanaAnchorProvider>
    );
}
