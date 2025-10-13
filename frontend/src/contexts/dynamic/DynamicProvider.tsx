import React from 'react';
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { SolanaWalletConnectors } from '@dynamic-labs/solana';
import { CHAINS, SOLANA_NETWORKS } from '../../constants/chains';

interface DynamicProviderProps {
    children: React.ReactNode;
}

// Convert existing chain configs to Dynamic.xyz format
const customEvmNetworks = CHAINS.map(chainConfig => ({
    blockExplorerUrls: chainConfig.chain.blockExplorers?.default?.url ? [chainConfig.chain.blockExplorers.default.url] : [],
    chainId: chainConfig.chain.id,
    chainName: chainConfig.chain.name,
    iconUrls: ['https://app.dynamic.xyz/assets/networks/eth.svg'],
    name: chainConfig.name,
    nativeCurrency: {
        decimals: chainConfig.chain.nativeCurrency.decimals,
        name: chainConfig.chain.nativeCurrency.name,
        symbol: chainConfig.chain.nativeCurrency.symbol,
        iconUrl: 'https://app.dynamic.xyz/assets/networks/eth.svg',
    },
    networkId: chainConfig.chain.id,
    rpcUrls: chainConfig.chain.rpcUrls.default.http,
    vanityName: chainConfig.name,
}));

const customSolanaNetworks = SOLANA_NETWORKS.map(network => ({
    blockExplorerUrls: ['https://explorer.solana.com'],
    chainId: network.name === 'Solana Local' ? 999 :
        network.name === 'Solana Mainnet' ? 101 :
            network.name === 'Solana Devnet' ? 103 : 102,
    chainName: network.name,
    iconUrls: ['https://app.dynamic.xyz/assets/networks/solana.svg'],
    name: 'Solana',
    nativeCurrency: {
        decimals: 9,
        name: 'Solana',
        symbol: 'SOL',
        iconUrl: 'https://app.dynamic.xyz/assets/networks/solana.svg',
    },
    networkId: network.name === 'Solana Local' ? 999 :
        network.name === 'Solana Mainnet' ? 101 :
            network.name === 'Solana Devnet' ? 103 : 102,
    rpcUrls: [network.rpcUrl],
    vanityName: network.name,
}));

export const DynamicProvider: React.FC<DynamicProviderProps> = ({ children }) => {
    return (
        <DynamicContextProvider
            settings={{
                environmentId: import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID,
                walletConnectors: [EthereumWalletConnectors, SolanaWalletConnectors],
                overrides: {
                    evmNetworks: customEvmNetworks,
                    solNetworks: customSolanaNetworks,
                },
                initialAuthenticationMode: 'connect-only'
            }}
        >
            {children}
        </DynamicContextProvider>
    );
};

export default DynamicProvider;
