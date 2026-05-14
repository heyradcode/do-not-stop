import React, { useMemo } from 'react';
import { useAccount, useProvider } from '@reown/appkit-react-native';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { CRYPTOPETS_PROGRAM_ID, CRYPTOPETS_SOLANA_RPC } from '@env';
import { SolanaAnchorProvider, parseProgramId } from '@shared/core';
import { createReownSolanaWallet } from './createReownSolanaWallet';

type ProviderRequest = (args: { method: string; params?: unknown }, chain: string) => Promise<unknown>;

/** Bridges Reown AppKit Solana into `@shared/core` Solana hooks (same as web wallet-adapter bridge). */
export function SolanaAppKitAnchorBridge({ children }: { children: React.ReactNode }) {
    const { provider } = useProvider();
    const { address, isConnected, namespace, chainId } = useAccount();

    const connection = useMemo(
        () =>
            new Connection(
                CRYPTOPETS_SOLANA_RPC?.trim() ? CRYPTOPETS_SOLANA_RPC.trim() : clusterApiUrl('devnet'),
                'confirmed'
            ),
        []
    );

    const programId = useMemo(() => parseProgramId(CRYPTOPETS_PROGRAM_ID), []);

    const signingWallet = useMemo(() => {
        if (!isConnected || namespace !== 'solana' || !provider || !address || chainId === undefined) {
            return null;
        }
        const req = (provider as { request: ProviderRequest }).request.bind(provider) as ProviderRequest;
        return createReownSolanaWallet(req, address, chainId as string | number);
    }, [isConnected, namespace, provider, address, chainId]);

    return (
        <SolanaAnchorProvider connection={connection} programId={programId} signingWallet={signingWallet}>
            {children}
        </SolanaAnchorProvider>
    );
}
