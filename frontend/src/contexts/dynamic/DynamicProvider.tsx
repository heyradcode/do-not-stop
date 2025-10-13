import React from 'react';
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { SolanaWalletConnectors } from '@dynamic-labs/solana';

interface DynamicProviderProps {
    children: React.ReactNode;
}

export const DynamicProvider: React.FC<DynamicProviderProps> = ({ children }) => {
    return (
        <DynamicContextProvider
            settings={{
                environmentId: import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID,
                walletConnectors: [EthereumWalletConnectors, SolanaWalletConnectors],
            }}
        >
            {children}
        </DynamicContextProvider>
    );
};

export default DynamicProvider;
