import { createAppKit, solana } from '@reown/appkit-react-native';
import { WagmiAdapter } from '@reown/appkit-wagmi-react-native';
import { SolanaAdapter } from '@reown/appkit-solana-react-native';
import { storage } from './StorageUtil';
import { REOWN_PROJECT_ID } from '@env';
import { getAppKitEvmNetworks } from './constants/ethereumNetworks';

const reownProjectId = REOWN_PROJECT_ID;

/**
 * Target chain first, handshake fallbacks last — see `getAppKitEvmNetworks`.
 *
 * Derived rather than listed here so `useEvmSessionChain` can read the same set
 * when deciding what it is allowed to switch to. A hand-kept second copy is how
 * the provider ends up pinned to a chain wagmi cannot switch away from.
 */
const evmNetworks = getAppKitEvmNetworks();

/** WalletConnect explorer IDs — featured so they still appear when custom chains (e.g. Hardhat) narrow the API wallet list. */
const FEATURED_WALLET_IDS = [
    'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
    '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0', // Trust Wallet
];

// Create Wagmi adapter for Ethereum chains
const wagmiAdapter = new WagmiAdapter({
    projectId: reownProjectId,
    networks: evmNetworks,
});

// Export wagmiConfig for App.tsx
export const wagmiConfig = wagmiAdapter.wagmiConfig;

// Create Solana adapter
const solanaAdapter = new SolanaAdapter();

// Create AppKit instance with both Ethereum and Solana support
export const appKit = createAppKit({
    projectId: reownProjectId,
    networks: [...evmNetworks, solana],
    /**
     * The target chain, not mainnet. AppKit pins the provider here after every
     * connect regardless of what the wallet approved, so naming an unplayable
     * chain guaranteed a wrong-network session on first launch.
     */
    defaultNetwork: evmNetworks[0],
    adapters: [wagmiAdapter, solanaAdapter],
    featuredWalletIds: FEATURED_WALLET_IDS,
    storage,
    metadata: {
        name: 'CryptoPets',
        description: 'CryptoPets Mobile App',
        /** Relay allowlist must allow this origin (see Reown Dashboard → Allowed domains). */
        url: 'https://cryptopets.app',
        icons: ['https://avatars.githubusercontent.com/u/179229932'],
        redirect: {
            native: "cryptopets://",
            universal: "cryptopets.app",
        },
    },
    features: {
        socials: [],
        showWallets: true,
    },
});
