import {
    // Mainnets
    mainnet,
    bsc,
    polygon,
    arbitrum,
    optimism,
    avalanche,
    base,
    fantom,
    celo,
    gnosis,
    // Testnets
    sepolia,
    bscTestnet,
    polygonMumbai,
    arbitrumSepolia,
    optimismSepolia,
    avalancheFuji,
    baseSepolia,
    fantomTestnet,
    celoAlfajores,
    gnosisChiado
} from 'viem/chains';
import { defineChain } from 'viem';

// Hardhat Local Network
const hardhatLocal = defineChain({
    id: 31337,
    name: 'Hardhat Local',
    nativeCurrency: {
        decimals: 18,
        name: 'Ether',
        symbol: 'ETH',
    },
    rpcUrls: {
        default: {
            http: ['http://localhost:8545'],
        },
    },
    testnet: true,
});

// Chain configuration interface
export interface ChainConfig {
    chain: any;
    name: string;
    symbol: string;
    isTestnet: boolean;
}

// Organized chains with testnets right after their mainnets
export const CHAINS: ChainConfig[] = [
    // Hardhat Local (for development)
    { chain: hardhatLocal, name: 'Hardhat Local', symbol: 'ETH', isTestnet: true },

    // Ethereum
    { chain: mainnet, name: 'Ethereum', symbol: 'ETH', isTestnet: false },
    { chain: sepolia, name: 'Sepolia', symbol: 'ETH', isTestnet: true },

    // BSC
    { chain: bsc, name: 'BSC', symbol: 'BNB', isTestnet: false },
    { chain: bscTestnet, name: 'BSC Testnet', symbol: 'tBNB', isTestnet: true },

    // Polygon
    { chain: polygon, name: 'Polygon', symbol: 'MATIC', isTestnet: false },
    { chain: polygonMumbai, name: 'Mumbai', symbol: 'MATIC', isTestnet: true },

    // Arbitrum
    { chain: arbitrum, name: 'Arbitrum', symbol: 'ETH', isTestnet: false },
    { chain: arbitrumSepolia, name: 'Arbitrum Sepolia', symbol: 'ETH', isTestnet: true },

    // Optimism
    { chain: optimism, name: 'Optimism', symbol: 'ETH', isTestnet: false },
    { chain: optimismSepolia, name: 'Optimism Sepolia', symbol: 'ETH', isTestnet: true },

    // Avalanche
    { chain: avalanche, name: 'Avalanche', symbol: 'AVAX', isTestnet: false },
    { chain: avalancheFuji, name: 'Fuji', symbol: 'AVAX', isTestnet: true },

    // Base
    { chain: base, name: 'Base', symbol: 'ETH', isTestnet: false },
    { chain: baseSepolia, name: 'Base Sepolia', symbol: 'ETH', isTestnet: true },

    // Fantom
    { chain: fantom, name: 'Fantom', symbol: 'FTM', isTestnet: false },
    { chain: fantomTestnet, name: 'Fantom Testnet', symbol: 'FTM', isTestnet: true },

    // Celo
    { chain: celo, name: 'Celo', symbol: 'CELO', isTestnet: false },
    { chain: celoAlfajores, name: 'Alfajores', symbol: 'CELO', isTestnet: true },

    // Gnosis
    { chain: gnosis, name: 'Gnosis', symbol: 'GNO', isTestnet: false },
    { chain: gnosisChiado, name: 'Chiado', symbol: 'GNO', isTestnet: true },
];

// Chain ID to native token symbol mapping
export const CHAIN_SYMBOLS: { [key: number]: string } = {
    31337: 'ETH',    // Hardhat Local
    1: 'ETH',        // Ethereum Mainnet
    11155111: 'ETH', // Sepolia
    56: 'BNB',       // BSC
    97: 'tBNB',      // BSC Testnet
    137: 'MATIC',    // Polygon
    80001: 'MATIC',  // Mumbai
    42161: 'ETH',    // Arbitrum
    421614: 'ETH',   // Arbitrum Sepolia
    10: 'ETH',       // Optimism
    11155420: 'ETH', // Optimism Sepolia
    43114: 'AVAX',   // Avalanche
    43113: 'AVAX',   // Fuji
    8453: 'ETH',     // Base
    84532: 'ETH',    // Base Sepolia
    250: 'FTM',      // Fantom
    4002: 'FTM',     // Fantom Testnet
    42220: 'CELO',   // Celo
    44787: 'CELO',   // Alfajores
    100: 'GNO',      // Gnosis
    10200: 'GNO',    // Chiado
};

// Utility functions
export const getNativeTokenSymbol = (chainId?: number): string => {
    if (!chainId) return 'ETH';
    return CHAIN_SYMBOLS[chainId] || 'ETH';
};

export const getChainConfig = (chainId: number): ChainConfig | undefined => {
    return CHAINS.find(chainConfig => chainConfig.chain.id === chainId);
};

export const getMainnetChains = (): ChainConfig[] => {
    return CHAINS.filter(chain => !chain.isTestnet);
};

export const getTestnetChains = (): ChainConfig[] => {
    return CHAINS.filter(chain => chain.isTestnet);
};

export const getChainsByType = (showTestnets: boolean): ChainConfig[] => {
    return showTestnets ? getTestnetChains() : getMainnetChains();
};
