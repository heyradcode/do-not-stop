import { describe, expect, it } from 'vitest';

import {
    formatTokenBalance,
    getPopularTokens,
    POPULAR_TOKENS,
} from '../../src/constants/tokens';

describe('getPopularTokens', () => {
    it('returns the token list for a known chain id', () => {
        const tokens = getPopularTokens(1);

        expect(tokens).toBe(POPULAR_TOKENS[1]);
        expect(tokens.length).toBeGreaterThan(0);
        expect(tokens.every((t) => t.chainId === 1)).toBe(true);
    });

    it('returns an empty array when chainId is undefined', () => {
        expect(getPopularTokens()).toEqual([]);
    });

    it('returns an empty array for an unknown chain id', () => {
        expect(getPopularTokens(999999)).toEqual([]);
    });
});

describe('formatTokenBalance', () => {
    it('formats a whole-number balance with no fractional part', () => {
        expect(formatTokenBalance(5_000_000n, 6)).toBe('5');
    });

    it('formats zero', () => {
        expect(formatTokenBalance(0n, 18)).toBe('0');
    });

    it('formats a balance with a fractional part, trimming trailing zeros', () => {
        // 1.5 with 6 decimals
        expect(formatTokenBalance(1_500_000n, 6)).toBe('1.5');
    });

    it('preserves leading zeros in the fractional part', () => {
        // 1.05 with 6 decimals
        expect(formatTokenBalance(1_050_000n, 6)).toBe('1.05');
    });

    it('keeps full fractional precision when nothing is trimmable', () => {
        expect(formatTokenBalance(1_234_567n, 6)).toBe('1.234567');
    });

    it('handles 18-decimal wei amounts', () => {
        expect(formatTokenBalance(1_500_000_000_000_000_000n, 18)).toBe('1.5');
    });

    it('handles a sub-1 balance (whole part is zero)', () => {
        // 0.25 with 2 decimals
        expect(formatTokenBalance(25n, 2)).toBe('0.25');
    });

    it('handles zero decimals (divisor is 1)', () => {
        expect(formatTokenBalance(42n, 0)).toBe('42');
    });
});