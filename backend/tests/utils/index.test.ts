import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    isEvmAddress,
    createNonce,
    sanitizeName,
    positiveMod,
    parseIntParam,
    withFallback,
} from '../../src/utils/index';

describe('isEvmAddress', () => {
    it('accepts valid 0x-prefixed 40-hex addresses (any case)', () => {
        expect(isEvmAddress('0x52908400098527886e0f7030069857d2e4169ee7')).toBe(true);
        expect(isEvmAddress('0x52908400098527886E0F7030069857D2E4169EE7')).toBe(true);
    });

    it('rejects missing prefix, wrong length, and non-hex', () => {
        expect(isEvmAddress('52908400098527886e0f7030069857d2e4169ee7')).toBe(false);
        expect(isEvmAddress('0x123')).toBe(false);
        expect(isEvmAddress('0x52908400098527886e0f7030069857d2e4169eeZ')).toBe(false);
        expect(isEvmAddress('')).toBe(false);
    });
});

describe('createNonce', () => {
    it('returns a non-empty URL-safe base64url token', () => {
        const nonce = createNonce();
        expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(nonce.length).toBeGreaterThan(0);
    });

    it('produces unique values across calls', () => {
        const values = new Set(Array.from({ length: 100 }, () => createNonce()));
        expect(values.size).toBe(100);
    });
});

describe('sanitizeName', () => {
    it('replaces angle brackets, quotes, and control characters with spaces', () => {
        // Each forbidden char becomes a space (not removed); surrounding spaces trim.
        expect(sanitizeName('<script>alert("x")</script>')).toBe('script alert( x ) /script');
        expect(sanitizeName('a\nb\tc\r')).toBe('a b c');
    });

    it('trims and truncates to maxLen', () => {
        expect(sanitizeName('   padded   ')).toBe('padded');
        expect(sanitizeName('abcdefghij', 4)).toBe('abcd');
    });

    it('falls back when the result is empty', () => {
        expect(sanitizeName('')).toBe('Unnamed');
        expect(sanitizeName('   ')).toBe('Unnamed');
        expect(sanitizeName('<>', 32, 'Anon')).toBe('Anon');
    });
});

describe('positiveMod', () => {
    it('returns a non-negative result for negative bigints', () => {
        expect(positiveMod(-1n, 6)).toBe(5);
        expect(positiveMod(-7n, 6)).toBe(5);
    });

    it('matches plain modulo for non-negative values', () => {
        expect(positiveMod(0n, 6)).toBe(0);
        expect(positiveMod(7n, 6)).toBe(1);
        expect(positiveMod(12n, 6)).toBe(0);
    });

    it('works with very large bigints', () => {
        expect(positiveMod(123456789012345678901234567890n, 6)).toBe(
            Number(123456789012345678901234567890n % 6n),
        );
    });
});

describe('parseIntParam', () => {
    it('parses valid integers and clamps to [min, max]', () => {
        expect(parseIntParam('5', 1, 0, 10)).toBe(5);
        expect(parseIntParam('100', 1, 0, 10)).toBe(10);
        expect(parseIntParam('-5', 1, 0, 10)).toBe(0);
    });

    it('returns the fallback for non-numeric or nullish input', () => {
        expect(parseIntParam('abc', 3, 0, 10)).toBe(3);
        expect(parseIntParam(undefined, 3, 0, 10)).toBe(3);
        expect(parseIntParam(null, 3, 0, 10)).toBe(3);
    });

    it('accepts numeric values as well as strings', () => {
        expect(parseIntParam(7, 1, 0, 10)).toBe(7);
    });
});

describe('withFallback', () => {
    afterEach(() => vi.restoreAllMocks());

    it('returns the function result when it resolves', async () => {
        await expect(withFallback('label', async () => 'ok', 'fallback')).resolves.toBe('ok');
    });

    it('returns the fallback and logs when the function throws', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await withFallback(
            'load-thing',
            async () => {
                throw new Error('boom');
            },
            'default',
        );
        expect(result).toBe('default');
        expect(errorSpy).toHaveBeenCalledWith('load-thing', expect.any(Error));
    });
});
