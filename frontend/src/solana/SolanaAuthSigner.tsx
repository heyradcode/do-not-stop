import { useEffect, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useDynamicContext, useUserWallets } from '@dynamic-labs/sdk-react-core';
import { isSolanaWallet } from '@dynamic-labs/solana';
import { setSolanaAuthSigner, type SolanaAuthSigner } from '@shared/core';

type DynamicSolanaSigner = {
    signMessage: (message: Uint8Array, encoding?: string) => Promise<unknown>;
};

type DynamicSolanaLike = {
    address: string;
    getSigner?: () => Promise<DynamicSolanaSigner | undefined>;
};

/**
 * Dynamic's `SolanaWallet.signMessage(string)` is the generic Dynamic API — it expects a string
 * and returns a string. Our auth flow signs raw bytes, so we must go through
 * `getSigner()` to reach the canonical `ISolana.signMessage(Uint8Array)` which returns
 * `{ signature: Uint8Array }`. Coercion to base58 is handled downstream by `signatureAuthCodec`.
 */
async function signerFromDynamicWallet(wallet: DynamicSolanaLike): Promise<SolanaAuthSigner | null> {
    if (typeof wallet.getSigner !== 'function') {
        return null;
    }
    const signer = await wallet.getSigner();
    if (!signer || typeof signer.signMessage !== 'function') {
        return null;
    }
    return {
        getAddress: () => wallet.address,
        signMessage: async (msg) => {
            const result = await signer.signMessage(msg);
            if (result instanceof Uint8Array) {
                return result;
            }
            if (result && typeof result === 'object' && 'signature' in result) {
                const sig = (result as { signature: unknown }).signature;
                if (sig instanceof Uint8Array) {
                    return sig;
                }
            }
            throw new Error('Dynamic Solana signer returned an unexpected signature shape');
        },
    };
}

/**
 * Registers Solana signing for {@link AuthProvider} / `signAndLogin`:
 * prefers `@solana/wallet-adapter-react` when connected; otherwise Dynamic Solana wallets.
 */
export function SolanaAuthSigner() {
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
