import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAccount, useSwitchChain } from 'wagmi';

import { isSupportedChain } from '../constants/ethereumNetworks';

/**
 * Keeps wagmi's idea of the active chain in step with the wallet's real one.
 *
 * Distinct from `useEvmSessionChain`, which moves the provider off a chain the wallet
 * never *approved*. This one handles a chain the wallet did approve and is genuinely on,
 * while wagmi still believes it is somewhere else — a state nothing can detect from
 * `useAccount()` alone, because that is the very value that is wrong.
 *
 * It matters because every write pins `chainId` from `useEvmPetsConfig`, which reads
 * `useAccount().chainId`. While the two disagree the wallet answers `eth_sendTransaction`
 * with -32602, "active chainId is different than the one provided", and retrying cannot
 * help: each attempt names the same stale chain.
 *
 * The wallet is the authority, never the app. Syncing the other way would drag a player
 * off a network they chose deliberately, and Sepolia is playable here too. A wallet on a
 * chain this build has no deployment for is left for `NetworkGate`, which knows how to ask.
 *
 * Checked on foreground rather than on a timer. Changing networks means leaving for the
 * wallet app and coming back, so returning to the foreground is both the moment the value
 * can have gone stale and the moment before the player tries to sign again. Subscribing
 * to `chainChanged` instead would only work when the notification arrives, and a missing
 * notification is the failure being repaired.
 */
export function useEvmChainSync(): void {
    const { isConnected, connector, chainId } = useAccount();
    const { switchChainAsync } = useSwitchChain();
    const isRepairing = useRef(false);

    const reconcile = useCallback(async () => {
        if (!isConnected || !connector?.getChainId || isRepairing.current) return;
        try {
            const actual = await connector.getChainId();
            if (actual === chainId) return;
            // `isSupportedChain`, not the wagmi network list: that list carries mainnet as
            // a handshake fallback so a testnet-less wallet has something to approve, and
            // following the wallet onto it would point every read at absent contracts.
            if (!isSupportedChain(actual)) return;

            isRepairing.current = true;
            // Already the wallet's own chain, so the provider settles this locally and no
            // prompt appears. What it buys is wagmi re-reading where the wallet actually is.
            await switchChainAsync({ chainId: actual });
        } catch {
            // A wallet that will not answer is not worth retrying into. The next foreground
            // tries again, and NetworkGate covers the case where it never answers.
        } finally {
            isRepairing.current = false;
        }
    }, [isConnected, connector, chainId, switchChainAsync]);

    useEffect(() => {
        if (!isConnected) return;
        reconcile().catch(() => undefined);
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') reconcile().catch(() => undefined);
        });
        return () => sub.remove();
    }, [isConnected, reconcile]);
}
