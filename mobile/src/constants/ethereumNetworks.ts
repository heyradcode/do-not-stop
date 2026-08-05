import type { Chain } from 'viem';
import { mainnet, sepolia } from 'wagmi/chains';
import { EVM_CHAIN_ID } from '@env';
import { hardhatLocal } from '../ethereumChains';

/** Display metadata aligned with `frontend/src/constants/chains/ethereum.ts`. */
export type EvmNetworkOption = {
    chain: Chain;
    name: string;
    symbol: string;
    isTestnet: boolean;
};

/**
 * Parses `EVM_CHAIN_ID` into a chain id, falling back to Sepolia.
 *
 * Exported for its test: `react-native-dotenv` inlines `@env` at Babel transform
 * time, so `TARGET_CHAIN_ID` below is a literal baked in from whatever `.env` the
 * machine happens to have. Only this function can be checked deterministically.
 *
 * A malformed value falls back rather than yielding `NaN`, which would make
 * `isSupportedChain` false forever and read as a wallet problem, not a typo.
 */
export function resolveTargetChainId(raw: string | undefined): number {
    if (!raw) return sepolia.id;
    const parsed = Number(raw);
    return Number.isInteger(parsed) ? parsed : sepolia.id;
}

/**
 * The chain this build's contracts are deployed on, mirroring frontend's
 * `TARGET_CHAIN_ID`. Sepolia rather than frontend's Base Sepolia: it is the only
 * network with a live PetCore and GameLogic. See
 * `docs/plan-mobile-frontend-parity.md` Phase 0.1 for why the two diverge.
 */
export const TARGET_CHAIN_ID = resolveTargetChainId(EVM_CHAIN_ID);

/**
 * Every chain the game can actually be played on, target chain first.
 *
 * Order matters: wagmi treats `chains[0]` as its default, so whatever sits first
 * is the chain RPC reads fall back to before a wallet reports a usable one.
 *
 * Chains without a deployment are deliberately absent, which is why Ethereum
 * mainnet appears in `EVM_SWITCHER_CHAINS` below but not here: offering one
 * would let a player switch to a network where every contract read silently
 * fails.
 */
export const CHAINS: EvmNetworkOption[] = [
    { chain: sepolia, name: 'Sepolia', symbol: 'ETH', isTestnet: true },
    ...(__DEV__
        ? [{ chain: hardhatLocal, name: 'Hardhat Local', symbol: 'ETH', isTestnet: true }]
        : []),
];

export const CHAIN_SYMBOLS: { [key: number]: string } = {
    31337: 'ETH', // Hardhat Local
    11155111: 'ETH', // Sepolia
};

export const getNativeTokenSymbol = (chainId?: number): string => {
    if (!chainId) return 'ETH';
    return CHAIN_SYMBOLS[chainId] || 'ETH';
};

/** True when the wallet's current chain is one the app has contracts on. */
export const isSupportedChain = (chainId: number | undefined): boolean =>
    chainId !== undefined && CHAINS.some((c) => c.chain.id === chainId);

/**
 * Networks exposed in AppKit / wagmi — same three as in `AppKitConfig`.
 *
 * Wider than `CHAINS` on purpose: this is what the switcher lists, and it still
 * offers mainnet, where nothing is deployed. Narrowing it belongs with the rest
 * of the network-switcher work in plan Phase 5, not here.
 */
export const EVM_SWITCHER_CHAINS: EvmNetworkOption[] = [
    { chain: hardhatLocal, name: 'Hardhat Local', symbol: 'ETH', isTestnet: true },
    { chain: mainnet, name: 'Ethereum', symbol: 'ETH', isTestnet: false },
    { chain: sepolia, name: 'Sepolia', symbol: 'ETH', isTestnet: true },
];

export function getEvmSwitcherChains(showTestnets: boolean): EvmNetworkOption[] {
    return EVM_SWITCHER_CHAINS.filter((c) => (showTestnets ? c.isTestnet : !c.isTestnet));
}

export function getEvmNetworkMeta(chainId: number): EvmNetworkOption | undefined {
    return EVM_SWITCHER_CHAINS.find((c) => c.chain.id === chainId);
}
