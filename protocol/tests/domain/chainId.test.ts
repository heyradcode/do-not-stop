import { describe, expect, it } from 'vitest';

import { assertChainId, chainFamily, evmChainId, solanaChainId } from '../../src/domain/chainId';

describe('evmChainId', () => {
    it('formats the networks this repo deploys to', () => {
        expect(evmChainId(84532)).toBe('eip155:84532'); // Base Sepolia
        expect(evmChainId(11155111)).toBe('eip155:11155111'); // Sepolia
        expect(evmChainId(31337)).toBe('eip155:31337'); // Hardhat
    });

    it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2])('rejects %s', (value) => {
        expect(() => evmChainId(value)).toThrow(/not a valid EVM chain id/);
    });
});

describe('solanaChainId', () => {
    it('formats known clusters', () => {
        expect(solanaChainId('devnet')).toBe('solana:devnet');
        expect(solanaChainId('localnet')).toBe('solana:localnet');
    });

    it('rejects an unknown cluster', () => {
        expect(() => solanaChainId('staging' as never)).toThrow(/not a known Solana cluster/);
    });
});

describe('assertChainId', () => {
    it('accepts both forms', () => {
        expect(assertChainId('eip155:84532')).toBe('eip155:84532');
        expect(assertChainId('solana:mainnet')).toBe('solana:mainnet');
    });

    it.each([
        '84532', // bare number, no namespace
        'eip155:', // missing reference
        'eip155:abc', // non-numeric reference
        'eip155:084532', // leading zero would give one chain two spellings
        'EIP155:84532', // namespace case matters
        'solana:Devnet', // cluster case matters
        'solana:genesis-hash', // not a cluster this protocol defines
        'bitcoin:mainnet',
        '',
    ])('rejects %s', (value) => {
        expect(() => assertChainId(value)).toThrow(/not a valid chain id|not a known Solana cluster/);
    });
});

describe('chainFamily', () => {
    it('maps back to this repo vocabulary', () => {
        expect(chainFamily('eip155:84532')).toBe('evm');
        expect(chainFamily('solana:devnet')).toBe('solana');
    });
});
