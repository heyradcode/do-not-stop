import { useEffect, useRef } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';

import { TARGET_CHAIN_ID, getAppKitEvmNetworks } from '../constants/ethereumNetworks';
import { pickRequestChainId } from '../utils/sessionChain';
import { useApprovedEvmChains } from './useApprovedEvmChains';

const CONFIGURED_EVM_CHAIN_IDS = getAppKitEvmNetworks().map((c) => c.id);

/**
 * Moves the provider off a chain the wallet never approved.
 *
 * Switching to an approved chain costs no wallet round trip: the provider handles
 * `wallet_switchEthereumChain` locally when the chain is already in the session.
 * That is the whole point — it repairs the session silently, so signing works and
 * `NetworkGate`'s switch button can reach the wallet at all.
 *
 * One attempt per target. A wallet that refuses gets the gate's reconnect
 * guidance instead of an endless switch loop.
 */
export function useEvmSessionChain(): void {
    const { isConnected, chainId } = useAccount();
    const { switchChainAsync } = useSwitchChain();
    const approved = useApprovedEvmChains();
    const attempted = useRef<number | null>(null);

    const repairTo = isConnected
        ? pickRequestChainId({
              approved,
              current: chainId,
              target: TARGET_CHAIN_ID,
              configured: CONFIGURED_EVM_CHAIN_IDS,
          })
        : null;

    useEffect(() => {
        if (!isConnected) {
            attempted.current = null;
        }
    }, [isConnected]);

    useEffect(() => {
        if (repairTo === null || attempted.current === repairTo) return;
        attempted.current = repairTo;
        switchChainAsync({ chainId: repairTo }).catch(() => undefined);
    }, [repairTo, switchChainAsync]);
}
