import {
    // L2 Mainnets
    arbitrum,
    optimism,
    base,
    // L2 Testnets
    arbitrumSepolia,
    optimismSepolia,
    baseSepolia,
} from 'viem/chains';
import { type Chain, defineChain } from 'viem';

const hardhatLocal = defineChain({
    id: 31337,
    name: 'Hardhat Local',
    nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
    rpcUrls: { default: { http: ['http://localhost:8545'] } },
    testnet: true,
});

export interface ChainConfig {
    chain: Chain;
    name: string;
    symbol: string;
    isTestnet: boolean;
}

export const CHAINS: ChainConfig[] = [
    // Local dev
    { chain: hardhatLocal, name: 'Hardhat Local', symbol: 'ETH', isTestnet: true },
    // Arbitrum
    { chain: arbitrum, name: 'Arbitrum', symbol: 'ETH', isTestnet: false },
    { chain: arbitrumSepolia, name: 'Arbitrum Sepolia', symbol: 'ETH', isTestnet: true },
    // Optimism
    { chain: optimism, name: 'Optimism', symbol: 'ETH', isTestnet: false },
    { chain: optimismSepolia, name: 'Optimism Sepolia', symbol: 'ETH', isTestnet: true },
    // Base
    { chain: base, name: 'Base', symbol: 'ETH', isTestnet: false },
    { chain: baseSepolia, name: 'Base Sepolia', symbol: 'ETH', isTestnet: true },
];

export const CHAIN_SYMBOLS: { [key: number]: string } = {
    31337: 'ETH', // Hardhat Local
    42161: 'ETH', // Arbitrum
    421614: 'ETH', // Arbitrum Sepolia
    10: 'ETH', // Optimism
    11155420: 'ETH', // Optimism Sepolia
    8453: 'ETH', // Base
    84532: 'ETH', // Base Sepolia
};

export const getNativeTokenSymbol = (chainId?: number): string => {
    if (!chainId) return 'ETH';
    return CHAIN_SYMBOLS[chainId] || 'ETH';
};

export const getChainConfig = (chainId: number): ChainConfig | undefined =>
    CHAINS.find((c) => c.chain.id === chainId);

export const getMainnetChains = (): ChainConfig[] => CHAINS.filter((c) => !c.isTestnet);

export const getTestnetChains = (): ChainConfig[] => CHAINS.filter((c) => c.isTestnet);

export const getChainsByType = (showTestnets: boolean): ChainConfig[] =>
    showTestnets ? getTestnetChains() : getMainnetChains();
