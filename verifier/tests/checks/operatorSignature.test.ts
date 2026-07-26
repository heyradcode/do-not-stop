import { describe, expect, it } from 'vitest';

import { checkOperatorSignature } from '../../src/checks/operatorSignature';
import { buildSignedReceipt, TEST_SIGNING_KEY_ID, testSigningAddress } from '../fixtures/signedReceipt';

describe('checkOperatorSignature', () => {
    it('passes a receipt genuinely signed by a trusted key', () => {
        const { receipt, envelope, trustedKey } = buildSignedReceipt();
        expect(checkOperatorSignature(envelope, receipt, [trustedKey])).toEqual({
            check: 'operator-signature',
            ok: true,
        });
    });

    it('fails when the signing key is not in the trusted list at all', () => {
        const { receipt, envelope } = buildSignedReceipt();
        const result = checkOperatorSignature(envelope, receipt, []);
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/not in the trusted key list/);
    });

    it('fails when the envelope and payload disagree about which key signed', () => {
        const { receipt, envelope, trustedKey } = buildSignedReceipt();
        const mismatched = { ...envelope, signingKeyId: 'some-other-key' };
        const result = checkOperatorSignature(mismatched, receipt, [trustedKey, { ...trustedKey, keyId: 'some-other-key' }]);
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/envelope names signing key/);
    });

    it('fails when the receiptHash does not match the recomputed digest', () => {
        const { receipt, envelope, trustedKey } = buildSignedReceipt();
        const tampered = { ...envelope, receiptHash: `0x${'ff'.repeat(32)}` };
        const result = checkOperatorSignature(tampered, receipt, [trustedKey]);
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/does not match the recomputed digest/);
    });

    it('fails when the signature does not recover to the trusted address', () => {
        const { receipt, envelope, trustedKey } = buildSignedReceipt();
        const wrongAddress = { ...trustedKey, address: '0x1111111111111111111111111111111111111111' };
        const result = checkOperatorSignature(envelope, receipt, [wrongAddress]);
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/signature recovers to/);
    });

    it('fails a malformed signature rather than throwing', () => {
        const { receipt, envelope, trustedKey } = buildSignedReceipt();
        const malformed = { ...envelope, signature: '0x1234' };
        expect(() => checkOperatorSignature(malformed, receipt, [trustedKey])).not.toThrow();
        expect(checkOperatorSignature(malformed, receipt, [trustedKey]).ok).toBe(false);
    });

    it('fails when the receipt was created before the key became valid', () => {
        const { receipt, envelope, trustedKey } = buildSignedReceipt();
        const notYetValid = { ...trustedKey, notBefore: receipt.createdAt + 1 };
        const result = checkOperatorSignature(envelope, receipt, [notYetValid]);
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/before key .* became valid/);
    });

    it('fails when the receipt was created after the key retired', () => {
        const { receipt, envelope, trustedKey } = buildSignedReceipt();
        const retired = { ...trustedKey, notAfter: receipt.createdAt - 1 };
        const result = checkOperatorSignature(envelope, receipt, [retired]);
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/after key .* retired/);
    });

    it('passes when the receipt falls inside an explicit validity window', () => {
        const { receipt, envelope, trustedKey } = buildSignedReceipt();
        const windowed = { ...trustedKey, notBefore: receipt.createdAt - 10, notAfter: receipt.createdAt + 10 };
        expect(checkOperatorSignature(envelope, receipt, [windowed]).ok).toBe(true);
    });

    it('matches keys by keyId regardless of address casing', () => {
        const { receipt, envelope, trustedKey } = buildSignedReceipt();
        const upper = { ...trustedKey, address: trustedKey.address.toUpperCase() };
        expect(checkOperatorSignature(envelope, receipt, [upper]).ok).toBe(true);
    });

    it('derives the address the same way the fixture computed it', () => {
        // Sanity check on the fixture itself, not the check under test: if this ever
        // disagrees, every other assertion here would be passing for the wrong reason.
        const { trustedKey } = buildSignedReceipt();
        expect(trustedKey.keyId).toBe(TEST_SIGNING_KEY_ID);
        expect(trustedKey.address).toBe(testSigningAddress());
    });
});
