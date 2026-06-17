import { formatEther } from 'viem';
import { useActiveChain } from './useActiveChain';
import { useEvmFees } from './chains/ethereum/useEvmFees';
import { useSolanaFees } from './chains/solana/useSolanaFees';
import { EVM_CAPABILITIES } from './adapters/useEvmAdapter';
import { SOLANA_CAPABILITIES } from './adapters/useSolanaAdapter';
import { formatLamports } from '../utils/solana/numbers';
import type { ChainCapabilities } from './adapters/types';
import type { PetChain } from '../types/pet';

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
    /** The connected chain as a PetChain value, or null when disconnected. Safe to pass to useOpponents. */
    activeKind: PetChain | null;
    isConnected: boolean;
    /** Connected wallet address; null when disconnected. */
    walletAddress: string | null;
}

export const useChainCapabilities = (): ChainContext => {
    const chain = useActiveChain();
    const isEvm = chain.kind === 'evm';
    const isSolana = chain.kind === 'solana';

    // Both fee hooks are always called (rules of hooks); the inactive one is disabled.
    const evmFees = useEvmFees(isEvm);
    const solanaFees = useSolanaFees(isSolana);

    const base =
        isEvm ? EVM_CAPABILITIES
        : isSolana ? SOLANA_CAPABILITIES
        : NULL_CAPABILITIES;

    const capabilities: ChainCapabilities =
        isEvm && evmFees.levelUpFee != null
            ? { ...base, levelUpFee: { amount: formatEther(evmFees.levelUpFee), symbol: 'ETH' } }
        : isSolana && solanaFees.levelUpFeeLamports != null
            ? { ...base, levelUpFee: { amount: formatLamports(solanaFees.levelUpFeeLamports), symbol: 'SOL' } }
        : base;

    return {
        ...capabilities,
        kind: chain.kind,
        activeKind: chain.kind !== 'none' ? chain.kind : null,
        isConnected: chain.kind !== 'none',
        walletAddress: chain.kind !== 'none' ? chain.address : null,
    };
}
