import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { setSolanaAuthSigner, type SolanaAuthSigner as SharedSolanaAuthSigner } from '@shared/core';
import { useDynamicSolanaWallet, type DynamicSolanaWalletLike } from '@chains/solana/useDynamicSolanaWallet';

/**
 * Dynamic's `SolanaWallet.signMessage(string)` is the generic Dynamic API — it expects a string
 * and returns a string. Our auth flow signs raw bytes, so we must go through
 * `getSigner()` to reach the canonical `ISolana.signMessage(Uint8Array)` which returns
 * `{ signature: Uint8Array }`. Coercion to base58 is handled downstream by `signatureAuthCodec`.
 */
const signerFromDynamicWallet = async (wallet: DynamicSolanaWalletLike): Promise<SharedSolanaAuthSigner | null> => {
    if (typeof wallet.getSigner !== 'function') {
        return null;
    }
    const signer = await wallet.getSigner();
    const signMessage = signer?.signMessage;
    if (!signer || typeof signMessage !== 'function') {
        return null;
    }
    return {
        getAddress: () => wallet.address,
        signMessage: async (msg) => {
            const result = await signMessage(msg);
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
export const SolanaAuthSigner = () => {
    const { publicKey, signMessage } = useWallet();
    const dynamicSolanaWallet = useDynamicSolanaWallet();

    useEffect(() => {
        let cancelled = false;

        if (publicKey && signMessage) {
            setSolanaAuthSigner({
                getAddress: () => publicKey.toBase58(),
                signMessage: (msg) => signMessage(msg),
            });
        } else if (dynamicSolanaWallet) {
            setSolanaAuthSigner(null);
            void signerFromDynamicWallet(dynamicSolanaWallet)
                .then((signer) => {
                    if (!cancelled) {
                        setSolanaAuthSigner(signer);
                    }
                })
                .catch(() => {
                    if (!cancelled) {
                        setSolanaAuthSigner(null);
                    }
                });
        } else {
            setSolanaAuthSigner(null);
        }

        return () => {
            cancelled = true;
            setSolanaAuthSigner(null);
        };
    }, [publicKey, signMessage, dynamicSolanaWallet]);

    return null;
}

export default SolanaAuthSigner;
