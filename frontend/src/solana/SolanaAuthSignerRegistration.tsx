import { useEffect, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useDynamicContext, useUserWallets } from '@dynamic-labs/sdk-react-core';
import { isSolanaWallet } from '@dynamic-labs/solana';
import { setSolanaAuthSigner, type SolanaAuthSigner } from '@shared/core';

type DynamicSolanaLike = {
    address: string;
    signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
    getSigner?: () => Promise<{ signMessage?: (message: Uint8Array) => Promise<Uint8Array> }>;
};

async function signerFromDynamicWallet(wallet: DynamicSolanaLike): Promise<SolanaAuthSigner | null> {
    if (typeof wallet.signMessage === 'function') {
        return {
            getAddress: () => wallet.address,
            signMessage: (msg) => wallet.signMessage!(msg),
        };
    }
    if (typeof wallet.getSigner === 'function') {
        const s = await wallet.getSigner();
        if (s && typeof s.signMessage === 'function') {
            return {
                getAddress: () => wallet.address,
                signMessage: (msg) => s.signMessage!(msg),
            };
        }
    }
    return null;
}

/**
 * Registers a Solana message signer for {@link AuthProvider} / `signAndLogin`.
 * Prefer `@solana/wallet-adapter-react` when connected; otherwise Dynamic Solana wallets.
 */
export default function SolanaAuthSignerRegistration() {
    const { publicKey, signMessage } = useWallet();
    const { primaryWallet } = useDynamicContext();
    const userWallets = useUserWallets();

    const dynamicSolanaWallet = useMemo(() => {
        const list = userWallets ?? [];
        const fromList = list.find((w) => isSolanaWallet(w));
        if (fromList) {
            return fromList as unknown as DynamicSolanaLike;
        }
        if (primaryWallet && isSolanaWallet(primaryWallet)) {
            return primaryWallet as unknown as DynamicSolanaLike;
        }
        return null;
    }, [userWallets, primaryWallet]);

    useEffect(() => {
        let cancelled = false;

        if (publicKey && signMessage) {
            setSolanaAuthSigner({
                getAddress: () => publicKey.toBase58(),
                signMessage: (msg) => signMessage(msg),
            });
            return () => {
                setSolanaAuthSigner(null);
            };
        }

        void (async () => {
            if (!dynamicSolanaWallet) {
                if (!cancelled) {
                    setSolanaAuthSigner(null);
                }
                return;
            }
            try {
                const s = await signerFromDynamicWallet(dynamicSolanaWallet);
                if (cancelled) {
                    return;
                }
                setSolanaAuthSigner(s);
            } catch {
                if (!cancelled) {
                    setSolanaAuthSigner(null);
                }
            }
        })();

        return () => {
            cancelled = true;
            setSolanaAuthSigner(null);
        };
    }, [publicKey, signMessage, dynamicSolanaWallet]);

    return null;
}
