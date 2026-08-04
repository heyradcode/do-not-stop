import { describe, expect, it } from 'vitest';

import {
    bytesToHex,
    concatBytes,
    hexToBytes,
    normalizeAccount,
    toBytes,
    uintToBytes,
    utf8ToBytes,
} from '../../src/encoding/bytes';

describe('hex conversion', () => {
    it('round-trips bytes through lowercase hex', () => {
        const bytes = new Uint8Array([0x00, 0x0f, 0xa0, 0xff]);
        expect(bytesToHex(bytes)).toBe('0x000fa0ff');
        expect(hexToBytes('0x000fa0ff')).toEqual(bytes);
    });

    it('accepts uppercase hex input and normalizes on the way out', () => {
        expect(bytesToHex(hexToBytes('0xDEADBEEF'))).toBe('0xdeadbeef');
    });

    it('encodes the empty byte string as bare 0x', () => {
        expect(bytesToHex(new Uint8Array(0))).toBe('0x');
        expect(hexToBytes('0x')).toEqual(new Uint8Array(0));
    });

    it.each([
        ['deadbeef', 'missing 0x prefix'],
        ['0xabc', 'odd digit count'],
        ['0xzz', 'non-hex digits'],
        ['', 'empty string'],
    ])('rejects %s (%s)', (value) => {
        expect(() => hexToBytes(value)).toThrow();
    });

    it('passes bytes through toBytes untouched', () => {
        const bytes = new Uint8Array([1, 2, 3]);
        expect(toBytes(bytes)).toBe(bytes);
        expect(toBytes('0x010203')).toEqual(bytes);
    });
});

describe('uintToBytes', () => {
    it('encodes big-endian at the requested width', () => {
        expect(bytesToHex(uintToBytes(1, 4))).toBe('0x00000001');
        expect(bytesToHex(uintToBytes(0x0102n, 4))).toBe('0x00000102');
        expect(bytesToHex(uintToBytes(255, 1))).toBe('0xff');
    });

    it('encodes the maximum value at each width used by the protocol', () => {
        expect(bytesToHex(uintToBytes(0xffn, 1))).toBe('0xff');
        expect(bytesToHex(uintToBytes((1n << 64n) - 1n, 8))).toBe('0xffffffffffffffff');
        expect(bytesToHex(uintToBytes((1n << 256n) - 1n, 32))).toBe(`0x${'ff'.repeat(32)}`);
    });

    it('throws rather than truncating an out-of-range value', () => {
        expect(() => uintToBytes(256, 1)).toThrow(/does not fit/);
        expect(() => uintToBytes(1n << 64n, 8)).toThrow(/does not fit/);
        expect(() => uintToBytes(1n << 256n, 32)).toThrow(/does not fit/);
    });

    it('rejects negative values', () => {
        expect(() => uintToBytes(-1, 4)).toThrow(/negative/);
        expect(() => uintToBytes(-1n, 32)).toThrow(/negative/);
    });

    it('rejects non-integers and unsafe numbers', () => {
        expect(() => uintToBytes(1.5, 4)).toThrow(/integer/);
        expect(() => uintToBytes(Number.MAX_SAFE_INTEGER + 2, 8)).toThrow(/MAX_SAFE_INTEGER/);
    });
});

describe('normalizeAccount', () => {
    it('lowercases EVM addresses so a checksummed spelling hashes identically', () => {
        expect(normalizeAccount('0xAbC0000000000000000000000000000000000123')).toBe(
            '0xabc0000000000000000000000000000000000123',
        );
    });

    it('leaves Solana base58 pubkeys alone, since base58 is case-sensitive', () => {
        const pubkey = 'DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6aK3TzhBd8ZUqzTqL';
        expect(normalizeAccount(pubkey)).toBe(pubkey);
    });

    it('does not touch strings that merely look hex-ish but are the wrong length', () => {
        expect(normalizeAccount('0xABCD')).toBe('0xABCD');
    });

    it('rejects an empty account', () => {
        expect(() => normalizeAccount('')).toThrow(/empty/);
    });
});

describe('utf8ToBytes', () => {
    it('counts bytes, not code points', () => {
        expect(utf8ToBytes('abc')).toHaveLength(3);
        // Four bytes for one emoji: the length prefix in the writer must be a byte
        // count, or a multi-byte name shifts every following field.
        expect(utf8ToBytes('🐉')).toHaveLength(4);
    });
});

describe('concatBytes', () => {
    it('joins chunks in order', () => {
        expect(bytesToHex(concatBytes([new Uint8Array([1]), new Uint8Array([2, 3])]))).toBe('0x010203');
    });

    it('returns an empty array for no chunks', () => {
        expect(concatBytes([])).toEqual(new Uint8Array(0));
    });
});
