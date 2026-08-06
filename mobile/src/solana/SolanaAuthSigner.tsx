import { useEffect } from 'react';
import { useAccount, useProvider } from '@reown/appkit-react-native';
import bs58 from 'bs58';
import { coerceSolanaEd25519SignatureBytes, setSolanaAuthSigner } from '@shared/core';

import { solanaProviderChainRef } from '../utils/solanaProviderChainRef';

type ProviderRequest = (
    args: { method: string; params?: unknown },
    chain: string,
) => Promise<unknown>;

/**
 * Registers AppKit's Solana wallet as the signer `@shared/core` reaches for.
 *
 * This is what makes Solana work at all, not a convenience. `useActiveChain`
 * resolves `kind: 'solana'` from this store and nothing else, and
 * `useChainAdapter` picks the Solana adapter only on that basis — so without a
 * registered signer a connected Solana wallet is invisible: every chain-blind
 * pet hook falls through to the EVM adapter or `noneAdapter`, and `signAndLogin`
 * has nothing to sign with. Frontend registers the same store from
 * `chains/solana/auth-signer.tsx`; mobile had the Anchor bridge but never this,
 * so its whole Solana path was unreachable.
 *
 * Renders nothing: it is a registration, and it lives beside the Anchor bridge
 * rather than inside it because the two feed different consumers (this one
 * auth and chain selection, that one transactions).
 */
export function SolanaAuthSigner() {
    const { provider } = useProvider();
    const { address, isConnected, namespace, chainId } = useAccount();

    useEffect(() => {
        if (!isConnected || namespace !== 'solana' || !provider || !address) {
            setSolanaAuthSigner(null);
            return () => setSolanaAuthSigner(null);
        }

        const request = (provider as { request: ProviderRequest }).request.bind(
            provider,
        ) as ProviderRequest;
        const chain = solanaProviderChainRef(chainId);
        const pubkey = address;

        setSolanaAuthSigner({
            getAddress: () => pubkey,
            signMessage: async (message: Uint8Array) => {
                const result = await request(
                    {
                        method: 'solana_signMessage',
                        params: { message: bs58.encode(message), pubkey },
                    },
                    chain,
                );
                // Wallets disagree on the shape here — a bare string, a
                // `{ signature }` wrapper, base58 / base64 / hex. `shared`'s codec
                // already enumerates every case it has met, so decoding by hand
                // would just be a narrower version of it.
                return coerceSolanaEd25519SignatureBytes(result);
            },
        });

        return () => setSolanaAuthSigner(null);
    }, [isConnected, namespace, provider, address, chainId]);

    return null;
}

export default SolanaAuthSigner;
