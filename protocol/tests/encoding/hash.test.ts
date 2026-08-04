import { describe, expect, it } from 'vitest';

import { bytesToHex, utf8ToBytes } from '../../src/encoding/bytes';
import { HASH_LENGTH, keccak256, keccak256Hex } from '../../src/encoding/hash';

/**
 * These vectors exist for one reason: to fail loudly if legacy Keccak-256 is ever
 * swapped for SHA3-256. The two differ by a padding byte, so a swap keeps
 * producing 32-byte digests that look fine and agree with nothing, including
 * Solidity's `keccak256` and every signature the contracts have ever produced.
 *
 * Expected values are the published Keccak-256 digests. The SHA3-256 digest of
 * the empty string is a6...0a (different in the first byte), so the empty-input
 * case alone catches the substitution.
 */
describe('keccak256', () => {
    it('matches the known digest of the empty input', () => {
        expect(keccak256Hex(new Uint8Array(0))).toBe(
            '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
        );
    });

    it('matches the known digest of "abc"', () => {
        expect(keccak256Hex(utf8ToBytes('abc'))).toBe(
            '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45',
        );
    });

    it('matches the known digest of "testing"', () => {
        expect(keccak256Hex(utf8ToBytes('testing'))).toBe(
            '0x5f16f4c7f149ac4f9510d9cf8cf384038ad348b3bcdc01915f95de12df9d1b02',
        );
    });

    it('returns 32 bytes', () => {
        const digest = keccak256(utf8ToBytes('anything'));
        expect(digest).toHaveLength(HASH_LENGTH);
        expect(bytesToHex(digest)).toMatch(/^0x[0-9a-f]{64}$/);
    });
});
