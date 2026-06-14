import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isPetReady, getTimeUntilReady } from '../../../src/utils/ethereum/petReadyTime';

// Fixed clock so bigint unix-second math is deterministic.
const NOW = new Date('2026-01-01T00:00:00Z');
const nowSeconds = () => Math.floor(NOW.getTime() / 1000);

describe('petReadyTime', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('isPetReady', () => {
        it('is true when readyTime is in the past', () => {
            expect(isPetReady(BigInt(nowSeconds() - 1))).toBe(true);
        });

        it('is true exactly at readyTime', () => {
            expect(isPetReady(BigInt(nowSeconds()))).toBe(true);
        });

        it('is false when readyTime is in the future', () => {
            expect(isPetReady(BigInt(nowSeconds() + 1))).toBe(false);
        });
    });

    describe('getTimeUntilReady', () => {
        it('returns "Ready!" when already ready', () => {
            expect(getTimeUntilReady(BigInt(nowSeconds()))).toBe('Ready!');
            expect(getTimeUntilReady(BigInt(nowSeconds() - 100))).toBe('Ready!');
        });

        it('formats hours and minutes when over an hour away', () => {
            const target = nowSeconds() + 2 * 3600 + 15 * 60; // 2h 15m
            expect(getTimeUntilReady(BigInt(target))).toBe('2h 15m');
        });

        it('formats minutes and seconds when under an hour away', () => {
            const target = nowSeconds() + 5 * 60 + 30; // 5m 30s
            expect(getTimeUntilReady(BigInt(target))).toBe('5m 30s');
        });

        it('formats seconds only when under a minute away', () => {
            const target = nowSeconds() + 42;
            expect(getTimeUntilReady(BigInt(target))).toBe('42s');
        });
    });
});
