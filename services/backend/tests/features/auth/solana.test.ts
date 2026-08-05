import { describe, it, expect } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { verifySolanaSignature } from '../../../src/features/auth/solana';

const MESSAGE = 'Sign this message to authenticate: nonce-123';

const makeSigner = () => {
    const keypair = nacl.sign.keyPair();
    const address = bs58.encode(keypair.publicKey);
    const sigBytes = nacl.sign.detached(new TextEncoder().encode(MESSAGE), keypair.secretKey);
    return { address, sigBytes };
};

describe('verifySolanaSignature', () => {
    it('verifies a base58-encoded signature', () => {
        const { address, sigBytes } = makeSigner();
        expect(verifySolanaSignature(address, bs58.encode(sigBytes), MESSAGE)).toBe(true);
    });

    it('verifies a hex-encoded signature (with and without 0x)', () => {
        const { address, sigBytes } = makeSigner();
        const hex = Buffer.from(sigBytes).toString('hex');
        expect(verifySolanaSignature(address, hex, MESSAGE)).toBe(true);
        expect(verifySolanaSignature(address, `0x${hex}`, MESSAGE)).toBe(true);
    });

    it('verifies a base64-encoded signature', () => {
        const { address, sigBytes } = makeSigner();
        const b64 = Buffer.from(sigBytes).toString('base64');
        expect(verifySolanaSignature(address, b64, MESSAGE)).toBe(true);
    });

    it('rejects when the message differs from what was signed', () => {
        const { address, sigBytes } = makeSigner();
        expect(verifySolanaSignature(address, bs58.encode(sigBytes), 'tampered message')).toBe(false);
    });

    it('rejects a signature from a different keypair', () => {
        const { address } = makeSigner();
        const other = nacl.sign.keyPair();
        const otherSig = nacl.sign.detached(new TextEncoder().encode(MESSAGE), other.secretKey);
        expect(verifySolanaSignature(address, bs58.encode(otherSig), MESSAGE)).toBe(false);
    });

    it('rejects an address that does not decode to a 32-byte key', () => {
        const { sigBytes } = makeSigner();
        // 16-byte base58 string -> wrong pubkey length
        const shortAddr = bs58.encode(new Uint8Array(16));
        expect(verifySolanaSignature(shortAddr, bs58.encode(sigBytes), MESSAGE)).toBe(false);
    });

    it('rejects an undecodable signature string', () => {
        const { address } = makeSigner();
        expect(verifySolanaSignature(address, '!!!not-a-signature!!!', MESSAGE)).toBe(false);
    });

    it('rejects a signature of the wrong length', () => {
        const { address } = makeSigner();
        expect(verifySolanaSignature(address, bs58.encode(new Uint8Array(32)), MESSAGE)).toBe(false);
    });

    it('returns false (does not throw) on a malformed address', () => {
        expect(verifySolanaSignature('not-base58-#@!', 'whatever', MESSAGE)).toBe(false);
    });
});
