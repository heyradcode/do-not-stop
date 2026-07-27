import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Abi } from 'viem';

/** A single deployed EVM contract the app talks to (address + ABI). */
export interface EvmContractRef {
    address?: `0x${string}`;
    abi: Abi;
}

/**
 * v2 splits the monolithic v1 contract into separate units. PetCore and
 * GameLogic are required (reads + writes); GameConfig is read-only and optional
 * (fee/cooldown display).
 *
 * There is no CombatSim entry: battles are simulated by the backend and replayed
 * from the signed receipt (§L Phase 6), so the client never calls the on-chain sim.
 */
export interface PetsEvmConfig {
    petCore: EvmContractRef;
    gameLogic: EvmContractRef;
    gameConfig?: EvmContractRef;
    enabled?: boolean;
    /** EVM chain ID the contracts are deployed on. Passed to read hooks so they
     *  use the right RPC regardless of which chain the wallet is connected to. */
    chainId?: number;
}

export interface PetsConfigContextValue {
    evm: PetsEvmConfig | null;
}

const PetsConfigContext = createContext<PetsConfigContextValue | null>(null);

export const usePetsConfig = (): PetsConfigContextValue => {
    const ctx = useContext(PetsConfigContext);
    if (!ctx) {
        throw new Error('usePetsConfig must be used within a PetsConfigProvider');
    }
    return ctx;
};

export interface PetsConfigProviderProps {
    children: ReactNode;
    evm?: PetsEvmConfig | null;
}

export const PetsConfigProvider = ({ children, evm = null }: PetsConfigProviderProps) => {
    const value = useMemo<PetsConfigContextValue>(() => ({ evm }), [evm]);
    return <PetsConfigContext.Provider value={value}>{children}</PetsConfigContext.Provider>;
};
