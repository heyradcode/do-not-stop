/**
 * `react-native-dotenv` inlines `@env` at Babel transform time, so `TARGET_CHAIN_ID`
 * is a literal baked in from whichever `.env` this machine has and asserting a value
 * for it would only test the local file. `resolveTargetChainId` is the parsing it
 * wraps, and that is checked directly.
 */

import { mainnet, sepolia } from 'wagmi/chains';

import {
    CHAINS,
    TARGET_CHAIN_ID,
    WC_FALLBACK_CHAINS,
    getAppKitEvmNetworks,
    getChainConfig,
    getNativeTokenSymbol,
    getTargetChainName,
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

    it('omits chains with no deployment, including the handshake fallback', () => {
        // Mainnet is offered in the WalletConnect proposal so testnet-less wallets
        // can approve something, but it has no contracts. It must not be listed as
        // somewhere to play, or the switcher could strand a player there.
        expect(WC_FALLBACK_CHAINS.some((c) => c.id === mainnet.id)).toBe(true);
        expect(CHAINS.some((c) => c.chain.id === mainnet.id)).toBe(false);
        expect(isSupportedChain(mainnet.id)).toBe(false);
    });

    it('does not treat an unknown chain as supported', () => {
        expect(isSupportedChain(84532)).toBe(false);
        expect(isSupportedChain(undefined)).toBe(false);
    });
});

describe('getChainConfig / getTargetChainName', () => {
    it('resolves a playable chain and names the target', () => {
        expect(getChainConfig(sepolia.id)?.name).toBe('Sepolia');
        expect(getTargetChainName(sepolia.id)).toBe('Sepolia');
    });

    it('does not resolve the handshake fallback', () => {
        expect(getChainConfig(mainnet.id)).toBeUndefined();
    });

    it('names an unknown chain by id rather than rendering "undefined"', () => {
        expect(getTargetChainName(84532)).toBe('chain 84532');
    });
});

describe('getAppKitEvmNetworks', () => {
    it('puts the target first so defaultNetwork lands on it', () => {
        expect(getAppKitEvmNetworks(sepolia.id)[0].id).toBe(sepolia.id);
    });

    it('trails the handshake fallback behind every playable chain', () => {
        const ids = getAppKitEvmNetworks(sepolia.id).map((c) => c.id);
        expect(ids).toContain(mainnet.id);
        expect(ids.indexOf(mainnet.id)).toBe(ids.length - 1);
    });

    it('lists each chain once', () => {
        const ids = getAppKitEvmNetworks(sepolia.id).map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('still leads with a playable chain when the target has no config', () => {
        // A typo'd EVM_CHAIN_ID must not put wagmi's default on the fallback.
        expect(getAppKitEvmNetworks(84532)[0].id).toBe(CHAINS[0].chain.id);
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
