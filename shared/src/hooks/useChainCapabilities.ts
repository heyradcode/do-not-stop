import { useActiveChain } from './useActiveChain';
import { EVM_CAPABILITIES } from './adapters/useEvmAdapter';
import { SOLANA_CAPABILITIES } from './adapters/useSolanaAdapter';
import type { ChainCapabilities } from './adapters/types';

const NULL_CAPABILITIES: ChainCapabilities = {
    chainLabel: '',
    address: { label: 'Address', placeholder: '', isValid: () => false },
    levelUpFee: null,
    renameMinLevel: 1,
    randomness: { provider: 'chainlink', appliesTo: [] },
    explorerTxUrl: () => null,
    parseError: (_err, fallback) => ({ message: fallback, isUserRejection: false, isContractError: false }),
};

/** Extends ChainCapabilities with connected-wallet context. */
export interface ChainContext extends ChainCapabilities {
    kind: 'evm' | 'solana' | 'none';
    isConnected: boolean;
    /** Connected wallet address; null when disconnected. */
    walletAddress: string | null;
}

export function useChainCapabilities(): ChainContext {
    const chain = useActiveChain();
    const capabilities =
        chain.kind === 'evm' ? EVM_CAPABILITIES
        : chain.kind === 'solana' ? SOLANA_CAPABILITIES
        : NULL_CAPABILITIES;
    return {
        ...capabilities,
        kind: chain.kind,
        isConnected: chain.kind !== 'none',
        walletAddress: chain.kind !== 'none' ? chain.address : null,
    };
}
