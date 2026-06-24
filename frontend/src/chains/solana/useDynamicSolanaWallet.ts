import { useMemo } from 'react';
import { useDynamicContext, useUserWallets } from '@dynamic-labs/sdk-react-core';
import { isSolanaWallet } from '@dynamic-labs/solana';
import type { SolanaSigningWallet } from '@shared/core';

export type DynamicSolanaSignerLike = {
    signTransaction: SolanaSigningWallet['signTransaction'];
    signAllTransactions: SolanaSigningWallet['signAllTransactions'];
    signMessage?: (message: Uint8Array, encoding?: string) => Promise<unknown>;
};

export type DynamicSolanaWalletLike = {
    address: string;
    getSigner?: () => Promise<DynamicSolanaSignerLike | undefined>;
};

/** Resolves the active Dynamic Solana wallet (user wallets list, then primary). */
export const useDynamicSolanaWallet = (): DynamicSolanaWalletLike | null => {
    const { primaryWallet } = useDynamicContext();
    const userWallets = useUserWallets();

    return useMemo(() => {
        const list = userWallets ?? [];
        const fromList = list.find((w) => isSolanaWallet(w));
        if (fromList) {
            return fromList as unknown as DynamicSolanaWalletLike;
        }
        if (primaryWallet && isSolanaWallet(primaryWallet)) {
            return primaryWallet as unknown as DynamicSolanaWalletLike;
        }
        return null;
    }, [userWallets, primaryWallet]);
};
