import { Connection, clusterApiUrl } from '@solana/web3.js';

// Solana Network Configuration
export interface SolanaNetworkConfig {
    name: string;
    rpcUrl: string;
    wsUrl?: string;
    isTestnet: boolean;
    connection: Connection;
}

// Check for Solana local RPC URL from environment or fallback to localhost
const getLocalRpcUrl = (): string => {
    // Check if custom local RPC URL is available via environment variable
    if (import.meta.env.VITE_SOLANA_LOCAL_RPC_URL) {
        return import.meta.env.VITE_SOLANA_LOCAL_RPC_URL;
    }

    // Default to localhost for local development
    return 'http://localhost:8899';
};

const localRpcUrl = getLocalRpcUrl();

// Solana network configurations
export const SOLANA_NETWORKS: SolanaNetworkConfig[] = [
    {
        name: 'Solana Local',
        rpcUrl: localRpcUrl,
        wsUrl: 'ws://localhost:8900',
        isTestnet: true,
        connection: new Connection(localRpcUrl, 'confirmed')
    },
    {
        name: 'Solana Devnet',
        rpcUrl: clusterApiUrl('devnet'),
        isTestnet: true,
        connection: new Connection(clusterApiUrl('devnet'), 'confirmed')
    },
    {
        name: 'Solana Testnet',
        rpcUrl: clusterApiUrl('testnet'),
        isTestnet: true,
        connection: new Connection(clusterApiUrl('testnet'), 'confirmed')
    },
    {
        name: 'Solana Mainnet',
        rpcUrl: clusterApiUrl('mainnet-beta'),
        isTestnet: false,
        connection: new Connection(clusterApiUrl('mainnet-beta'), 'confirmed')
    }
];

// Solana utility functions
export const getSolanaNetwork = (name: string): SolanaNetworkConfig | undefined => {
    return SOLANA_NETWORKS.find(network => network.name === name);
};

export const getSolanaNetworksByType = (showTestnets: boolean): SolanaNetworkConfig[] => {
    return SOLANA_NETWORKS.filter(network => network.isTestnet === showTestnets);
};

export const getSolanaMainnetNetworks = (): SolanaNetworkConfig[] => {
    return SOLANA_NETWORKS.filter(network => !network.isTestnet);
};

export const getSolanaTestnetNetworks = (): SolanaNetworkConfig[] => {
    return SOLANA_NETWORKS.filter(network => network.isTestnet);
};
