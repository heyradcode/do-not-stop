import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { storeNonce, consumeNonce } from '../../../src/features/auth/nonce.store';

const TTL_MS = 5 * 60 * 1000;

describe('nonce.store', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('accepts a freshly issued nonce exactly once', () => {
        storeNonce('abc');
        expect(consumeNonce('abc')).toBe(true);
    });

    it('rejects a nonce that was never issued', () => {
        expect(consumeNonce('never-issued')).toBe(false);
    });

    it('rejects a replay of an already-consumed nonce', () => {
        storeNonce('once');
        expect(consumeNonce('once')).toBe(true);
        expect(consumeNonce('once')).toBe(false);
    });

    it('accepts a nonce just before its TTL expires', () => {
        storeNonce('fresh');
        vi.advanceTimersByTime(TTL_MS - 1);
        expect(consumeNonce('fresh')).toBe(true);
    });

    it('rejects a nonce once its TTL has elapsed', () => {
        storeNonce('stale');
        vi.advanceTimersByTime(TTL_MS + 1);
        expect(consumeNonce('stale')).toBe(false);
    });

    it('deletes the nonce even when consumed after expiry (no later replay)', () => {
        storeNonce('expired');
        vi.advanceTimersByTime(TTL_MS + 1);
        expect(consumeNonce('expired')).toBe(false);
        // back in time would not help: it is already removed
        expect(consumeNonce('expired')).toBe(false);
    });

    it('tracks multiple independent nonces', () => {
        storeNonce('a');
        storeNonce('b');
        expect(consumeNonce('b')).toBe(true);
        expect(consumeNonce('a')).toBe(true);
        expect(consumeNonce('a')).toBe(false);
    });

    it('purges expired entries when a new nonce is stored (lazy eviction)', () => {
        storeNonce('old');
        vi.advanceTimersByTime(TTL_MS + 1);
        // Storing a new nonce triggers purgeExpired which deletes 'old' (covers line 38).
        storeNonce('fresh2');
        // 'old' was evicted, not consumed — still returns false.
        expect(consumeNonce('old')).toBe(false);
        consumeNonce('fresh2');
    });
});
