import { describe, expect, it } from 'vitest';

import {
    CHAINS,
    getChainConfig,
    getChainsByType,
    getMainnetChains,
    getNativeTokenSymbol,
    getTestnetChains,
} from '../../../src/constants/chains/ethereum';

describe('getNativeTokenSymbol', () => {
    it('defaults to ETH when no chain id is given', () => {
        expect(getNativeTokenSymbol()).toBe('ETH');
    });

    it('returns the mapped symbol for a known chain', () => {
        expect(getNativeTokenSymbol(56)).toBe('BNB');
        expect(getNativeTokenSymbol(137)).toBe('MATIC');
        expect(getNativeTokenSymbol(43114)).toBe('AVAX');
    });

    it('falls back to ETH for an unknown chain id', () => {
        expect(getNativeTokenSymbol(999999)).toBe('ETH');
    });
});

describe('getChainConfig', () => {
    it('finds a chain config by chain id', () => {
        const config = getChainConfig(1);

        expect(config).toBeDefined();
        expect(config?.name).toBe('Ethereum');
        expect(config?.isTestnet).toBe(false);
    });

    it('returns undefined for an unknown chain id', () => {
        expect(getChainConfig(999999)).toBeUndefined();
    });
});

describe('mainnet / testnet partitioning', () => {
    it('getMainnetChains returns only non-testnet chains', () => {
        const mainnets = getMainnetChains();

        expect(mainnets.length).toBeGreaterThan(0);
        expect(mainnets.every((c) => c.isTestnet === false)).toBe(true);
    });

    it('getTestnetChains returns only testnet chains', () => {
        const testnets = getTestnetChains();

        expect(testnets.length).toBeGreaterThan(0);
        expect(testnets.every((c) => c.isTestnet === true)).toBe(true);
    });

    it('mainnets and testnets together account for every chain', () => {
        expect(getMainnetChains().length + getTestnetChains().length).toBe(CHAINS.length);
    });
});

describe('getChainsByType', () => {
    it('returns testnets when showTestnets is true', () => {
        expect(getChainsByType(true)).toEqual(getTestnetChains());
    });

    it('returns mainnets when showTestnets is false', () => {
        expect(getChainsByType(false)).toEqual(getMainnetChains());
    });
});