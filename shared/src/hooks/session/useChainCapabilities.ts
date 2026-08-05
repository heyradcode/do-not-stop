import { useActiveChain } from './useActiveChain';
import { useFees } from './useFees';
import { EVM_CAPABILITIES } from '../adapters/useEvmAdapter';
import { SOLANA_CAPABILITIES } from '../adapters/useSolanaAdapter';
import type { ChainCapabilities } from '../adapters/types';
import type { PetChain } from '../../types/pet';

const NULL_CAPABILITIES: ChainCapabilities = {
    chainLabel: '',
    address: { label: 'Address', placeholder: '', isValid: () => false },
    levelUpFee: null,
    renameMinLevel: 1,
    randomness: { provider: null, appliesTo: [] },
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
    const fees = useFees();

    const base =
        chain.kind === 'evm' ? EVM_CAPABILITIES
        : chain.kind === 'solana' ? SOLANA_CAPABILITIES
        : NULL_CAPABILITIES;

    const capabilities: ChainCapabilities =
        fees.levelUpFee != null && fees.symbol != null
            ? { ...base, levelUpFee: { amount: fees.formatAmountOnly(fees.levelUpFee), symbol: fees.symbol } }
            : base;

    return {
        ...capabilities,
        kind: chain.kind,
        activeKind: chain.kind !== 'none' ? chain.kind : null,
        isConnected: chain.kind !== 'none',
        walletAddress: chain.kind !== 'none' ? chain.address : null,
    };
};
