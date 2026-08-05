/**
 * `react-native-dotenv` inlines `@env` at Babel transform time, so `TARGET_CHAIN_ID`
 * is a literal baked in from whichever `.env` this machine has and asserting a value
 * for it would only test the local file. `resolveTargetChainId` is the parsing it
 * wraps, and that is checked directly.
 */

import { sepolia } from 'wagmi/chains';

import {
    CHAINS,
    EVM_SWITCHER_CHAINS,
    TARGET_CHAIN_ID,
    getNativeTokenSymbol,
    isSupportedChain,
    resolveTargetChainId,
} from '../src/constants/ethereumNetworks';

describe('resolveTargetChainId', () => {
    it('parses a chain id', () => {
        expect(resolveTargetChainId('11155111')).toBe(sepolia.id);
        expect(resolveTargetChainId('31337')).toBe(31337);
    });

    it('falls back to Sepolia when unset or empty', () => {
        expect(resolveTargetChainId(undefined)).toBe(sepolia.id);
        expect(resolveTargetChainId('')).toBe(sepolia.id);
    });

    it('falls back rather than returning NaN for a malformed value', () => {
        expect(resolveTargetChainId('sepolia')).toBe(sepolia.id);
        expect(resolveTargetChainId('1.5')).toBe(sepolia.id);
    });
});

describe('TARGET_CHAIN_ID', () => {
    it('is a chain the app has contracts on', () => {
        expect(isSupportedChain(TARGET_CHAIN_ID)).toBe(true);
    });
});

describe('CHAINS', () => {
    it('puts the target chain first, because wagmi defaults to chains[0]', () => {
        expect(CHAINS[0].chain.id).toBe(sepolia.id);
    });

    it('omits chains with no deployment', () => {
        // Mainnet is offered by the switcher but has no contracts, so switching to
        // it must read as unsupported rather than as silently failing reads.
        expect(EVM_SWITCHER_CHAINS.some((c) => c.chain.id === 1)).toBe(true);
        expect(isSupportedChain(1)).toBe(false);
    });

    it('does not treat an unknown chain as supported', () => {
        expect(isSupportedChain(84532)).toBe(false);
        expect(isSupportedChain(undefined)).toBe(false);
    });
});

describe('getNativeTokenSymbol', () => {
    it('resolves known chains and defaults to ETH', () => {
        expect(getNativeTokenSymbol(sepolia.id)).toBe('ETH');
        expect(getNativeTokenSymbol(31337)).toBe('ETH');
        expect(getNativeTokenSymbol(999999)).toBe('ETH');
        expect(getNativeTokenSymbol(undefined)).toBe('ETH');
    });
});
