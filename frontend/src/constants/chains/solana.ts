import { clusterApiUrl } from '@solana/web3.js';

export interface SolanaNetworkConfig {
    name: string;
    rpcUrl: string;
    isTestnet: boolean;
}

const localRpcUrl = import.meta.env.VITE_SOLANA_LOCAL_RPC_URL || 'http://localhost:8899';

export const SOLANA_NETWORKS: SolanaNetworkConfig[] = [
    { name: 'Solana Local', rpcUrl: localRpcUrl, isTestnet: true },
    { name: 'Solana Devnet', rpcUrl: clusterApiUrl('devnet'), isTestnet: true },
    { name: 'Solana Testnet', rpcUrl: clusterApiUrl('testnet'), isTestnet: true },
    { name: 'Solana Mainnet', rpcUrl: clusterApiUrl('mainnet-beta'), isTestnet: false },
];
