import { describe, expect, it } from 'vitest';

import { base58ToBytes, bytesToBase58 } from '../../src/encoding/base58';

/**
 * Base58, hand-written here so third parties running the verifier need one fewer dependency.
 *
 * The vectors below were cross-checked against `bs58` before being pinned, so this suite is
 * a guard against drift rather than a restatement of the implementation.
 */

const ZERO_32 = new Uint8Array(32);
const MAX_32 = new Uint8Array(32).fill(0xff);

function bytes(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

describe('known vectors', () => {
    it.each([
        ['00'.repeat(32), '1'.repeat(32)],
        ['ff'.repeat(32), 'JEKNVnkbo3jma5nREBBJCDoXFVeKkD56V3xKrvRmWxFG'],
        ['01', '2'],
        ['61', '2g'],
    ])('encodes %s', (hex, expected) => {
        expect(bytesToBase58(bytes(hex))).toBe(expected);
    });

    it.each([
        ['00'.repeat(32), '1'.repeat(32)],
        ['ff'.repeat(32), 'JEKNVnkbo3jma5nREBBJCDoXFVeKkD56V3xKrvRmWxFG'],
        ['01', '2'],
        ['61', '2g'],
    ])('decodes back to %s', (hex, encoded) => {
        expect(base58ToBytes(encoded)).toEqual(bytes(hex));
    });
});

describe('leading zeros', () => {
    // Where naive implementations break: a leading zero byte carries no numeric value, so
    // big-integer conversion alone drops it and the key decodes short.
    it('preserves an all-zero key as 32 ones', () => {
        expect(bytesToBase58(ZERO_32)).toBe('1'.repeat(32));
        expect(base58ToBytes('1'.repeat(32))).toEqual(ZERO_32);
    });

    it('round-trips a key with a single zero prefix', () => {
        const value = bytes(`00${'ff'.repeat(31)}`);
        expect(base58ToBytes(bytesToBase58(value))).toEqual(value);
    });

    it('round-trips a key with several zero prefixes', () => {
        const value = bytes(`0000${'11'.repeat(30)}`);
        expect(base58ToBytes(bytesToBase58(value))).toEqual(value);
    });
});

describe('round trips', () => {
    it.each([ZERO_32, MAX_32, bytes(`00${'ab'.repeat(31)}`), bytes('deadbeef')])(
        'survives a round trip',
        (value) => {
            expect(base58ToBytes(bytesToBase58(value))).toEqual(value);
        },
    );
});

describe('rejecting malformed input', () => {
    it('rejects an empty string', () => {
        expect(() => base58ToBytes('')).toThrow(/empty/);
    });

    // The alphabet omits 0, O, I and l precisely because they are easy to misread. Skipping
    // one would decode a typo'd pubkey to a different valid-looking key.
    it.each(['0', 'O', 'I', 'l'])('rejects the excluded character %s', (char) => {
        expect(() => base58ToBytes(`11${char}11`)).toThrow(/not a base58 character/);
    });

    it('rejects non-ASCII rather than reading past the lookup table', () => {
        expect(() => base58ToBytes('11é11')).toThrow(/not a base58 character/);
    });

    it('encodes empty input as an empty string', () => {
        expect(bytesToBase58(new Uint8Array(0))).toBe('');
    });
});
