import { defineChain, type Chain } from 'viem';
import { HARDHAT_RPC_URL } from '@env';

/**
 * The same chain, reading through `rpcUrl` instead of its built-in public endpoint.
 *
 * Returns the chain untouched when no URL is given, so an unconfigured build behaves
 * exactly as before. Only the RPC changes: id, currency and explorer are what the wallet
 * matches on when adding or switching networks, and rewriting those would offer the
 * player a network their wallet cannot recognise.
 */
export const withRpcUrl = (chain: Chain, rpcUrl: string | undefined): Chain => {
    const url = rpcUrl?.trim();
    if (!url) return chain;

    return {
        ...chain,
        rpcUrls: {
            ...chain.rpcUrls,
            default: { ...chain.rpcUrls.default, http: [url] },
        },
    };
};

/** Matches local Hardhat / Anvil default (see frontend `hardhatLocal`); RPC host differs on mobile (see above). */
export const hardhatLocal = defineChain({
    id: 31337,
    name: 'Hardhat Local',
    nativeCurrency: {
        decimals: 18,
        name: 'Ether',
        symbol: 'ETH',
    },
    rpcUrls: {
        default: {
            http: [HARDHAT_RPC_URL || 'http://127.0.0.1:8545'],
        },
    },
    /** Local Hardhat has no canonical explorer; wallets often require this field for add/switch network. */
    blockExplorers: {
        default: {
            name: 'Hardhat',
            url: 'https://hardhat.org/hardhat-network',
        },
    },
    testnet: true,
});
