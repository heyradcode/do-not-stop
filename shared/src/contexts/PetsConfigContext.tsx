import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Abi } from 'viem';

export interface PetsEvmConfig {
    contractAddress?: `0x${string}`;
    abi: Abi;
    enabled?: boolean;
}

export interface PetsConfigContextValue {
    evm: PetsEvmConfig | null;
}

const PetsConfigContext = createContext<PetsConfigContextValue | null>(null);

export function usePetsConfig(): PetsConfigContextValue {
    const ctx = useContext(PetsConfigContext);
    if (!ctx) {
        throw new Error('usePetsConfig must be used within a PetsConfigProvider');
    }
    return ctx;
}

export interface PetsConfigProviderProps {
    children: ReactNode;
    evm?: PetsEvmConfig | null;
}

export function PetsConfigProvider({ children, evm = null }: PetsConfigProviderProps) {
    const value = useMemo<PetsConfigContextValue>(() => ({ evm }), [evm]);
    return <PetsConfigContext.Provider value={value}>{children}</PetsConfigContext.Provider>;
}
