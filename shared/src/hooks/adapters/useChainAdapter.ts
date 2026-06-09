import { useActiveChain } from '../useActiveChain';
import { useEvmAdapter } from './useEvmAdapter';
import { useSolanaAdapter } from './useSolanaAdapter';
import { noneAdapter } from './noneAdapter';
import type { ChainAdapter } from './types';

/**
 * Returns the active chain's adapter. Both adapters are always mounted
 * (rules of hooks); the inactive one runs with `enabled: false` so its
 * queries stay dormant. Consumers are fully chain-blind.
 */
export function useChainAdapter(): ChainAdapter {
    const chain = useActiveChain();
    const evm = useEvmAdapter({ enabled: chain.kind === 'evm' });
    const solana = useSolanaAdapter({ enabled: chain.kind === 'solana' });

    if (chain.kind === 'evm') return evm;
    if (chain.kind === 'solana') return solana;
    return noneAdapter;
}
