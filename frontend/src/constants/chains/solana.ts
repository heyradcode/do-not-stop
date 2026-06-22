import { clusterApiUrl } from '@solana/web3.js';

export interface SolanaNetworkConfig {
    name: string;
    rpcUrl: string;
    isTestnet: boolean;
}

const localRpcUrl = import.meta.env.VITE_SOLANA_LOCAL_RPC_URL || 'http://localhost:8899';
// Prefer a dedicated devnet RPC (Helius/QuickNode/etc.) when provided; the public
// clusterApiUrl('devnet') endpoint is heavily rate-limited and makes reads/sends flaky.
const devnetRpcUrl = import.meta.env.VITE_SOLANA_DEVNET_RPC_URL || clusterApiUrl('devnet');

export const SOLANA_NETWORKS: SolanaNetworkConfig[] = [
    { name: 'Solana Local', rpcUrl: localRpcUrl, isTestnet: true },
    { name: 'Solana Devnet', rpcUrl: devnetRpcUrl, isTestnet: true },
    { name: 'Solana Testnet', rpcUrl: clusterApiUrl('testnet'), isTestnet: true },
    { name: 'Solana Mainnet', rpcUrl: clusterApiUrl('mainnet-beta'), isTestnet: false },
];

/** Maps the `VITE_SOLANA_CLUSTER` env value to a `SOLANA_NETWORKS` entry name. */
export const solanaNetworkNameFromCluster = (cluster: string | undefined): string => {
    switch ((cluster ?? '').trim().toLowerCase()) {
        case 'devnet':
            return 'Solana Devnet';
        case 'testnet':
            return 'Solana Testnet';
        case 'mainnet':
        case 'mainnet-beta':
            return 'Solana Mainnet';
        case 'local':
        case 'localnet':
        case 'localhost':
        case '':
            return 'Solana Local';
        default:
            return 'Solana Local';
    }
};
