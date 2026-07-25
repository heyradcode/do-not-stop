import { describe, expect, it } from 'vitest';

import {
    CHAINS,
    TARGET_CHAIN_ID,
    getChainConfig,
    getNativeTokenSymbol,
    isSupportedChain,
} from '../../../src/constants/chains/ethereum';

describe('getNativeTokenSymbol', () => {
    it('defaults to ETH when no chain id is given', () => {
        expect(getNativeTokenSymbol()).toBe('ETH');
    });

    it('returns the mapped symbol for a known chain', () => {
        expect(getNativeTokenSymbol(84532)).toBe('ETH'); // Base Sepolia
        expect(getNativeTokenSymbol(31337)).toBe('ETH'); // Hardhat Local
    });

    it('falls back to ETH for an unknown chain id', () => {
        expect(getNativeTokenSymbol(999999)).toBe('ETH');
    });
});

describe('getChainConfig', () => {
    it('finds a chain config by chain id', () => {
        const config = getChainConfig(84532);

        expect(config).toBeDefined();
        expect(config?.name).toBe('Base Sepolia');
        expect(config?.isTestnet).toBe(true);
    });

    it('returns undefined for an unknown chain id', () => {
        expect(getChainConfig(999999)).toBeUndefined();
    });
});

describe('CHAINS', () => {
    // wagmi treats chains[0] as its default, so anything else here sends RPC
    // reads to the wrong endpoint before a wallet reports a usable chain.
    it('lists the target chain first', () => {
        expect(CHAINS[0]?.chain.id).toBe(TARGET_CHAIN_ID);
    });

    it('only lists chains with a deployment', () => {
        // Mainnets and the other testnets have no contracts; offering them would
        // let a player switch to a network where every read silently fails.
        expect(CHAINS.every((c) => c.isTestnet)).toBe(true);
        expect(CHAINS.map((c) => c.chain.id)).not.toContain(8453); // Base mainnet
        expect(CHAINS.map((c) => c.chain.id)).not.toContain(42161); // Arbitrum
    });
});

describe('isSupportedChain', () => {
    it('accepts the target chain', () => {
        expect(isSupportedChain(TARGET_CHAIN_ID)).toBe(true);
    });

    it('rejects a chain with no deployment', () => {
        expect(isSupportedChain(1)).toBe(false); // Ethereum mainnet
        expect(isSupportedChain(11155111)).toBe(false); // Sepolia
    });

    it('rejects an undefined chain id', () => {
        expect(isSupportedChain(undefined)).toBe(false);
    });
});
