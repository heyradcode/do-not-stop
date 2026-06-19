import { describe, it, expect } from 'vitest';
import { vrfTimingForEndpoint, COMMIT_REVEAL_WAIT_MS, REVEAL_RETRIES, REVEAL_BACKOFF_MS } from '../../../src/utils/solana/switchboardVrfTx';

describe('vrfTimingForEndpoint', () => {
    it('returns default devnet timing for devnet endpoint', () => {
        const t = vrfTimingForEndpoint('https://api.devnet.solana.com');
        expect(t.commitRevealWaitMs).toBe(COMMIT_REVEAL_WAIT_MS);
        expect(t.revealRetries).toBe(REVEAL_RETRIES);
        expect(t.revealBackoffMs).toBe(REVEAL_BACKOFF_MS);
    });

    it('returns increased retries and wait for mainnet endpoint', () => {
        const t = vrfTimingForEndpoint('https://api.mainnet-beta.solana.com');
        expect(t.commitRevealWaitMs).toBeGreaterThan(COMMIT_REVEAL_WAIT_MS);
        expect(t.revealRetries).toBeGreaterThan(REVEAL_RETRIES);
        expect(t.revealBackoffMs).toBeGreaterThanOrEqual(REVEAL_BACKOFF_MS);
    });

    it('returns default timing for localhost', () => {
        const t = vrfTimingForEndpoint('http://localhost:8899');
        expect(t.revealRetries).toBe(REVEAL_RETRIES);
    });

    it('returns mainnet timing when endpoint contains mainnet', () => {
        const t = vrfTimingForEndpoint('https://my-mainnet-rpc.example.com');
        expect(t.revealRetries).toBeGreaterThan(REVEAL_RETRIES);
    });
});
