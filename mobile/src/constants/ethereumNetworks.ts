import type { Chain } from 'viem';
import { baseSepolia, mainnet, sepolia } from 'wagmi/chains';
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
 * Parses `EVM_CHAIN_ID` into a chain id, falling back to Base Sepolia.
 *
 * Exported for its test: `react-native-dotenv` inlines `@env` at Babel transform
 * time, so `TARGET_CHAIN_ID` below is a literal baked in from whatever `.env` the
 * machine happens to have. Only this function can be checked deterministically.
 *
 * A malformed value falls back rather than yielding `NaN`, which would make
 * `isSupportedChain` false forever and read as a wallet problem, not a typo.
 */
export function resolveTargetChainId(raw: string | undefined): number {
    if (!raw) return baseSepolia.id;
    const parsed = Number(raw);
    return Number.isInteger(parsed) ? parsed : baseSepolia.id;
}

/**
 * The chain this build's contracts are deployed on, mirroring frontend's
 * `TARGET_CHAIN_ID`.
 *
 * Base Sepolia since 2026-08-06, when the stack was deployed there. That closes
 * the divergence recorded in `docs/plan-mobile-frontend-parity.md` Phase 0.1:
 * mobile targeted Sepolia only because Base Sepolia had no PetCore or GameLogic
 * at the time, while frontend pointed at Base Sepolia and read nothing.
 */
export const TARGET_CHAIN_ID = resolveTargetChainId(EVM_CHAIN_ID);

/**
 * Every chain the game can actually be played on, in preference order.
 *
 * Both carry a full deployment, so a player can switch between them and the pet
 * list follows (see `useEvmPetsConfig`). `getAppKitEvmNetworks` reorders this so
 * whatever `EVM_CHAIN_ID` names leads, since wagmi treats `chains[0]` as its
 * default and that is the chain RPC reads fall back to before a wallet reports a
 * usable one.
 *
 * Chains without a deployment are deliberately absent: offering one would let a
 * player switch to a network where every contract read silently fails. This is
 * also exactly what the network switcher lists, so the switcher can no longer
 * strand a player somewhere `isSupportedChain` rejects.
 *
 * Hardhat appears only when it is the configured chain, not merely in dev. It has
 * no built-in addresses, and the `.env` overrides that would supply them apply to
 * `EVM_CHAIN_ID`'s chain alone. Listing it while something else is the target
 * would offer a switch to a network whose reads quietly resolve against the
 * target's contracts, which is the same failure the per-chain address map exists
 * to prevent.
 */
export const CHAINS: EvmNetworkOption[] = [
    { chain: baseSepolia, name: 'Base Sepolia', symbol: 'ETH', isTestnet: true },
    { chain: sepolia, name: 'Sepolia', symbol: 'ETH', isTestnet: true },
    ...(__DEV__ && TARGET_CHAIN_ID === hardhatLocal.id
        ? [{ chain: hardhatLocal, name: 'Hardhat Local', symbol: 'ETH', isTestnet: true }]
        : []),
];

export const CHAIN_SYMBOLS: { [key: number]: string } = {
    31337: 'ETH', // Hardhat Local
    84532: 'ETH', // Base Sepolia
    11155111: 'ETH', // Sepolia
};

export const getNativeTokenSymbol = (chainId?: number): string => {
    if (!chainId) return 'ETH';
    return CHAIN_SYMBOLS[chainId] || 'ETH';
};

export const getChainConfig = (chainId: number): EvmNetworkOption | undefined =>
    CHAINS.find((c) => c.chain.id === chainId);

/** True when the wallet's current chain is one the app has contracts on. */
export const isSupportedChain = (chainId: number | undefined): boolean =>
    chainId !== undefined && CHAINS.some((c) => c.chain.id === chainId);

/** Target chain's name for player-facing copy; mirrors frontend's inline fallback. */
export const getTargetChainName = (targetChainId: number = TARGET_CHAIN_ID): string =>
    getChainConfig(targetChainId)?.name ?? `chain ${targetChainId}`;

/**
 * Offered in the WalletConnect proposal, never in the switcher.
 *
 * A wallet approves the intersection of what it supports with what was requested
 * and rejects the whole proposal when that intersection is empty. `CHAINS` is
 * testnet-only, so a wallet that ships no testnets matches nothing and the
 * connect dies before the player can act on it. Mainnet gives such a wallet
 * something to approve, which turns a dead connect into a wrong-network banner.
 *
 * It buys a connection, not an authorization: `CHAINS` still excludes it, so a
 * player who lands here gets `NetworkGate` rather than a broken game. That is
 * also why it is not an `EvmNetworkOption`: nothing should be able to list it
 * as somewhere to play.
 */
export const WC_FALLBACK_CHAINS: Chain[] = [mainnet];

/**
 * Wagmi / AppKit network list, target first, handshake fallbacks last.
 *
 * The single source of truth for what wagmi is configured with, so
 * `useEvmSessionChain` can ask what it is allowed to switch to without
 * duplicating `AppKitConfig`'s list. Fallbacks trail the playable chains so
 * `defaultNetwork`, and any wallet that simply takes the first entry, still land
 * on the target.
 */
export function getAppKitEvmNetworks(
    targetChainId: number = TARGET_CHAIN_ID,
): [Chain, ...Chain[]] {
    const playable = CHAINS.map((c) => c.chain);
    const target = getChainConfig(targetChainId)?.chain ?? CHAINS[0].chain;
    const rest = playable.filter((c) => c.id !== target.id);
    const fallbacks = WC_FALLBACK_CHAINS.filter(
        (c) => c.id !== target.id && !rest.some((r) => r.id === c.id),
    );
    return [target, ...rest, ...fallbacks];
}
