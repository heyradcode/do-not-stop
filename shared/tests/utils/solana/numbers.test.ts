import { describe, it, expect } from 'vitest';
import { BN } from '@coral-xyz/anchor';
import { toU32, formatLamports } from '../../../src/utils/solana/numbers';

describe('toU32', () => {
    it('unwraps a BN to a JS number', () => {
        expect(toU32(new BN(42))).toBe(42);
        expect(toU32(new BN(0))).toBe(0);
        expect(toU32(new BN(4_294_967_295))).toBe(4_294_967_295); // u32 max
    });

    it('passes plain numbers through', () => {
        expect(toU32(7)).toBe(7);
        expect(toU32(0)).toBe(0);
    });

    it('coerces numeric strings', () => {
        expect(toU32('123')).toBe(123);
    });

    it('coerces bigints via Number()', () => {
        expect(toU32(99n)).toBe(99);
    });

    it('returns NaN for non-numeric input', () => {
        expect(toU32('not-a-number')).toBeNaN();
        expect(toU32(undefined)).toBeNaN();
        expect(toU32({})).toBeNaN();
    });
});

describe('formatLamports', () => {
    it('formats whole SOL values without decimals', () => {
        expect(formatLamports(1_000_000_000n)).toBe('1');
    });

    it('formats common fee amounts correctly', () => {
        expect(formatLamports(10_000_000n)).toBe('0.01');   // 0.01 SOL
        expect(formatLamports(20_000_000n)).toBe('0.02');   // 0.02 SOL
    });

    it('formats zero', () => {
        expect(formatLamports(0n)).toBe('0');
    });

    it('does not use thousands separators', () => {
        expect(formatLamports(2_000_000_000n)).toBe('2');
        expect(formatLamports(10_000_000_000n)).toBe('10');
    });
});
