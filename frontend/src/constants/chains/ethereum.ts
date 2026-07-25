import { baseSepolia } from 'viem/chains';
import { type Chain, defineChain } from 'viem';

const hardhatLocal = defineChain({
    id: 31337,
    name: 'Hardhat Local',
    nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
    rpcUrls: { default: { http: ['http://localhost:8545'] } },
    testnet: true,
});

/**
 * The chain this build's contracts are deployed on. `VITE_EVM_CHAIN_ID` (see
 * `.env.local`) overrides it; Base Sepolia is the default because it is the only
 * network with a live v2 deployment.
 */
export const TARGET_CHAIN_ID = import.meta.env.VITE_EVM_CHAIN_ID
    ? Number(import.meta.env.VITE_EVM_CHAIN_ID)
    : baseSepolia.id;

export interface ChainConfig {
    chain: Chain;
    name: string;
    symbol: string;
    isTestnet: boolean;
}

/**
 * Every chain the game can actually be played on, target chain first.
 *
 * Order matters: wagmi treats `chains[0]` as its default, so whatever sits first
 * is the chain RPC reads fall back to before a wallet reports a usable one.
 * Hardhat Local used to hold that slot, which pointed hosted builds at
 * `localhost:8545`.
 *
 * Chains without a deployment are deliberately absent: offering them would let a
 * player switch to a network where every contract read silently fails.
 */
export const CHAINS: ChainConfig[] = [
    { chain: baseSepolia, name: 'Base Sepolia', symbol: 'ETH', isTestnet: true },
    ...(import.meta.env.DEV
        ? [{ chain: hardhatLocal, name: 'Hardhat Local', symbol: 'ETH', isTestnet: true }]
        : []),
];

export const CHAIN_SYMBOLS: { [key: number]: string } = {
    31337: 'ETH', // Hardhat Local
    84532: 'ETH', // Base Sepolia
};

export const getNativeTokenSymbol = (chainId?: number): string => {
    if (!chainId) return 'ETH';
    return CHAIN_SYMBOLS[chainId] || 'ETH';
};

export const getChainConfig = (chainId: number): ChainConfig | undefined =>
    CHAINS.find((c) => c.chain.id === chainId);

/** True when the wallet's current chain is one the app has contracts on. */
export const isSupportedChain = (chainId: number | undefined): boolean =>
    chainId !== undefined && CHAINS.some((c) => c.chain.id === chainId);
