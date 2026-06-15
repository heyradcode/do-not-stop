import { describe, expect, it } from 'vitest';

import {
    SOLANA_NETWORKS,
    solanaNetworkNameFromCluster,
} from '../../../src/constants/chains/solana';

describe('solanaNetworkNameFromCluster', () => {
    it('maps devnet / testnet clusters', () => {
        expect(solanaNetworkNameFromCluster('devnet')).toBe('Solana Devnet');
        expect(solanaNetworkNameFromCluster('testnet')).toBe('Solana Testnet');
    });

    it('maps both mainnet aliases', () => {
        expect(solanaNetworkNameFromCluster('mainnet')).toBe('Solana Mainnet');
        expect(solanaNetworkNameFromCluster('mainnet-beta')).toBe('Solana Mainnet');
    });

    it('maps the local aliases and empty/undefined to Solana Local', () => {
        for (const cluster of ['local', 'localnet', 'localhost', '', undefined]) {
            expect(solanaNetworkNameFromCluster(cluster)).toBe('Solana Local');
        }
    });

    it('normalises casing and surrounding whitespace', () => {
        expect(solanaNetworkNameFromCluster('  DevNet  ')).toBe('Solana Devnet');
    });

    it('defaults unknown clusters to Solana Local', () => {
        expect(solanaNetworkNameFromCluster('not-a-cluster')).toBe('Solana Local');
    });

    it('every mapped name resolves to a real SOLANA_NETWORKS entry', () => {
        const names = new Set(SOLANA_NETWORKS.map((n) => n.name));
        for (const cluster of ['devnet', 'testnet', 'mainnet-beta', 'local']) {
            expect(names.has(solanaNetworkNameFromCluster(cluster))).toBe(true);
        }
    });
});