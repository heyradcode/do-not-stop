import { describe, expect, it } from 'vitest';

import { bytesToHex } from '../../src/encoding/bytes';
import { DOMAIN_TAGS } from '../../src/encoding/domain';
import { CanonicalWriter } from '../../src/encoding/writer';

const write = () => CanonicalWriter.withDomain(DOMAIN_TAGS.RECEIPT);
const HASH_A = `0x${'11'.repeat(32)}` as const;
const HASH_B = `0x${'22'.repeat(32)}` as const;

describe('field framing', () => {
    it('makes adjacent text fields unambiguous', () => {
        // The whole point of length prefixes. Concatenated naively, both of these
        // are "abc", and a boundary an attacker can move is a digest they can
        // forge a second meaning for.
        const first = write().text('ab').text('c').digestHex();
        const second = write().text('a').text('bc').digestHex();
        expect(first).not.toBe(second);
    });

    it('distinguishes an absent optional from an empty one', () => {
        const absent = write().optional(null, (w, v: string) => w.text(v)).digestHex();
        const empty = write().optional('', (w, v: string) => w.text(v)).digestHex();
        expect(absent).not.toBe(empty);
    });

    it('distinguishes an empty array from an absent optional array', () => {
        const emptyArray = write().array([] as string[], (w, v) => w.text(v)).digestHex();
        const absent = write().optional(null, (w, v: string[]) => w.array(v, (ww, x) => ww.text(x))).digestHex();
        expect(emptyArray).not.toBe(absent);
    });

    it('treats array order as significant', () => {
        const ascending = write().array(['1', '2'], (w, v) => w.text(v)).digestHex();
        const descending = write().array(['2', '1'], (w, v) => w.text(v)).digestHex();
        expect(ascending).not.toBe(descending);
    });

    it('separates array elements from a single concatenated element', () => {
        const two = write().array(['a', 'b'], (w, v) => w.text(v)).digestHex();
        const one = write().array(['ab'], (w, v) => w.text(v)).digestHex();
        expect(two).not.toBe(one);
    });

    it('does not conflate a numeric field with its decimal text', () => {
        expect(write().u32(7).digestHex()).not.toBe(write().text('7').digestHex());
    });

    it('encodes prefixes as a 4-byte big-endian byte count', () => {
        expect(bytesToHex(CanonicalWriter.withDomain(DOMAIN_TAGS.SEED).build())).toBe(
            `0x00000014${Buffer.from(DOMAIN_TAGS.SEED, 'utf8').toString('hex')}`,
        );
        // Byte count, not character count: one emoji is four bytes.
        const emoji = write().text('🐉').build();
        expect(bytesToHex(emoji.slice(-8))).toBe('0x00000004f09f9089');
    });
});

describe('domain separation', () => {
    it('gives identical field sequences different digests under different tags', () => {
        const asReceipt = CanonicalWriter.withDomain(DOMAIN_TAGS.RECEIPT).u64(1).digestHex();
        const asCommitment = CanonicalWriter.withDomain(DOMAIN_TAGS.COMMITMENT).u64(1).digestHex();
        expect(asReceipt).not.toBe(asCommitment);
    });

    it('writes the tag before any field', () => {
        const tagOnly = CanonicalWriter.withDomain(DOMAIN_TAGS.INTENT).build();
        const withField = CanonicalWriter.withDomain(DOMAIN_TAGS.INTENT).u8(9).build();
        expect(bytesToHex(withField).startsWith(bytesToHex(tagOnly))).toBe(true);
    });
});

describe('determinism', () => {
    it('produces the same digest for the same field sequence', () => {
        const build = () =>
            write()
                .u8(1)
                .u16(2)
                .u32(3)
                .u64(4n)
                .u256(5n)
                .bool(true)
                .hash(HASH_A)
                .bytes('0xdeadbeef')
                .text('pet')
                .account('0xABC0000000000000000000000000000000000123')
                .array([1, 2], (w, v) => w.u32(v))
                .optional(HASH_B, (w, v) => w.hash(v))
                .digestHex();
        expect(build()).toBe(build());
    });

    it('is insensitive to EVM address casing but not to pubkey casing', () => {
        const lower = write().account('0xabc0000000000000000000000000000000000123').digestHex();
        const checksummed = write().account('0xAbC0000000000000000000000000000000000123').digestHex();
        expect(lower).toBe(checksummed);

        const pubkey = write().account('DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6aK3TzhBd8ZUqzTqL').digestHex();
        const mangled = write().account('drip2pn2k6fumlkqmt5rzwyhiuz6ak3tzhbd8zuqztql').digestHex();
        expect(pubkey).not.toBe(mangled);
    });

    it('accepts a hash as bytes or hex interchangeably', () => {
        const asHex = write().hash(HASH_A).digestHex();
        const asBytes = write().hash(new Uint8Array(32).fill(0x11)).digestHex();
        expect(asHex).toBe(asBytes);
    });
});

describe('validation', () => {
    it('rejects a hash that is not 32 bytes', () => {
        expect(() => write().hash('0x1234')).toThrow(/32-byte/);
        expect(() => write().hash(new Uint8Array(31))).toThrow(/32-byte/);
    });

    it('rejects out-of-range integers at each width', () => {
        expect(() => write().u8(256)).toThrow(/does not fit/);
        expect(() => write().u16(65536)).toThrow(/does not fit/);
        expect(() => write().u32(2 ** 32)).toThrow(/does not fit/);
        expect(() => write().u64(1n << 64n)).toThrow(/does not fit/);
        expect(() => write().u256(1n << 256n)).toThrow(/does not fit/);
    });

    it('rejects malformed hex in a byte field', () => {
        expect(() => write().bytes('0xnothex' as `0x${string}`)).toThrow();
    });
});

describe('digest', () => {
    it('agrees with the hex form', () => {
        const writer = write().u32(42);
        expect(bytesToHex(writer.digest())).toBe(writer.digestHex());
    });
});
