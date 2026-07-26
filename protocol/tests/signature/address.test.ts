import { describe, expect, it } from 'vitest';

import type { Hex } from '../../src/encoding/bytes';
import { recoverAddress } from '../../src/signature/address';

/**
 * Fixture generated once with `ethers.SigningKey(privateKey).sign(digest)` for private key
 * `0x1111...1111` (32 bytes of `0x11`) over `keccak256(utf8("cryptopets-protocol-signature-fixture"))`.
 * Committed as a literal so this test needs no `ethers` dependency at all — the whole point
 * of `recoverAddress` is to not need one.
 */
const DIGEST: Hex = '0x51280f91d621920c44441165ae6e38817dc118a90bcf6427d818a8d85239bf5e';
const SIGNATURE: Hex =
    '0xfb79273ae8cb0676caff20fc405cf3fbf42d7d45df727755a6d87934343373803efc722962a89bccbc8742768428c4f554c335230b46516aeb4b550626c5314b1b';
const EXPECTED_ADDRESS: Hex = '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a';

describe('recoverAddress', () => {
    it('recovers the signing address from a real ethers-produced signature', () => {
        expect(recoverAddress(DIGEST, SIGNATURE)).toBe(EXPECTED_ADDRESS);
    });

    it('recovers a different address for a different digest under the same signature', () => {
        const otherDigest: Hex = `0x${'22'.repeat(32)}`;
        expect(recoverAddress(otherDigest, SIGNATURE)).not.toBe(EXPECTED_ADDRESS);
    });

    it('rejects a digest that is not 32 bytes', () => {
        expect(() => recoverAddress('0x1234', SIGNATURE)).toThrow(/32-byte digest/);
    });

    it('rejects a signature that is not 65 bytes', () => {
        expect(() => recoverAddress(DIGEST, '0x1234')).toThrow(/65-byte/);
    });

    it('rejects a signature whose recovery byte is out of range', () => {
        const bytes = `${SIGNATURE.slice(0, -2)}ff` as Hex;
        expect(() => recoverAddress(DIGEST, bytes)).toThrow(/recovery byte/);
    });

    it('accepts a recovery byte already in {0, 1} form, not only {27, 28}', () => {
        // The fixture's v byte is 0x1b (27) => recovery=0; the {0,1} spelling of the same
        // recovery bit must recover the same address.
        const zeroOneForm = `${SIGNATURE.slice(0, -2)}00` as Hex;
        expect(recoverAddress(DIGEST, zeroOneForm)).toBe(recoverAddress(DIGEST, SIGNATURE));
    });
});
