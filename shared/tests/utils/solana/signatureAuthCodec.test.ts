import { describe, it, expect } from 'vitest';
import bs58 from 'bs58';
import {
    coerceSolanaEd25519SignatureBytes,
    normalizeSolanaSignatureToBase58,
} from '../../../src/utils/solana/signatureAuthCodec';

// A deterministic 64-byte signature (bytes 0..63) used across encodings.
const SIG_BYTES = new Uint8Array(Array.from({ length: 64 }, (_, i) => i));
const HEX = Buffer.from(SIG_BYTES).toString('hex'); // 128 hex chars
const BASE58 = bs58.encode(SIG_BYTES);
const BASE64 = Buffer.from(SIG_BYTES).toString('base64');

describe('coerceSolanaEd25519SignatureBytes', () => {
    it('decodes a 128-char hex string (with and without 0x)', () => {
        expect(coerceSolanaEd25519SignatureBytes(HEX)).toEqual(SIG_BYTES);
        expect(coerceSolanaEd25519SignatureBytes(`0x${HEX}`)).toEqual(SIG_BYTES);
    });

    it('decodes a base58 string', () => {
        expect(coerceSolanaEd25519SignatureBytes(BASE58)).toEqual(SIG_BYTES);
    });

    it('decodes a base64 string (standard and URL-safe)', () => {
        expect(coerceSolanaEd25519SignatureBytes(BASE64)).toEqual(SIG_BYTES);
        const urlSafe = BASE64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        expect(coerceSolanaEd25519SignatureBytes(urlSafe)).toEqual(SIG_BYTES);
    });

    it('accepts a 64-byte Uint8Array as-is', () => {
        expect(coerceSolanaEd25519SignatureBytes(SIG_BYTES)).toBe(SIG_BYTES);
    });

    it('accepts a 64-element number array', () => {
        expect(coerceSolanaEd25519SignatureBytes(Array.from(SIG_BYTES))).toEqual(SIG_BYTES);
    });

    it('unwraps an object with a signature field', () => {
        expect(coerceSolanaEd25519SignatureBytes({ signature: BASE58 })).toEqual(SIG_BYTES);
    });

    it('throws on a null/undefined signature', () => {
        expect(() => coerceSolanaEd25519SignatureBytes(null)).toThrow(/Missing Solana signature/);
        expect(() => coerceSolanaEd25519SignatureBytes(undefined)).toThrow(/Missing Solana signature/);
    });

    it('throws on an undecodable string', () => {
        expect(() => coerceSolanaEd25519SignatureBytes('!!!not-valid!!!')).toThrow(/Could not decode/);
    });

    it('throws on wrong-length byte inputs', () => {
        expect(() => coerceSolanaEd25519SignatureBytes(new Uint8Array(32))).toThrow(/64-byte/);
        expect(() => coerceSolanaEd25519SignatureBytes(Array(10).fill(0))).toThrow(/64-byte/);
    });

    it('throws on unsupported types', () => {
        expect(() => coerceSolanaEd25519SignatureBytes(123 as unknown)).toThrow(/Unexpected Solana signature type/);
    });
});

describe('normalizeSolanaSignatureToBase58', () => {
    it('round-trips any supported encoding to canonical base58', () => {
        expect(normalizeSolanaSignatureToBase58(HEX)).toBe(BASE58);
        expect(normalizeSolanaSignatureToBase58(BASE64)).toBe(BASE58);
        expect(normalizeSolanaSignatureToBase58(SIG_BYTES)).toBe(BASE58);
        expect(normalizeSolanaSignatureToBase58({ signature: HEX })).toBe(BASE58);
    });
});
