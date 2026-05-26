import { useSyncExternalStore } from 'react';
import { useAccount } from 'wagmi';
import {
    getSolanaAuthAddressSnapshot,
    subscribeSolanaAuth,
} from '../auth/solanaAuthBridge';

export type ActiveChain =
    | { kind: 'evm'; address: `0x${string}` }
    | { kind: 'solana'; address: string }
    | { kind: 'none' };

/**
 * Resolves which chain the user is currently connected to. EVM wins when both are
 * connected, matching {@link AuthContext} sign-in precedence.
 */
export function useActiveChain(): ActiveChain {
    const { address, isConnected } = useAccount();
    const solanaAddress = useSyncExternalStore(
        subscribeSolanaAuth,
        getSolanaAuthAddressSnapshot,
        () => null
    );

    if (isConnected && address) {
        return { kind: 'evm', address };
    }
    if (solanaAddress) {
        return { kind: 'solana', address: solanaAddress };
    }
    return { kind: 'none' };
}
