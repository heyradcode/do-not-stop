import { describe, expect, it } from 'vitest';

import { ethers } from 'ethers';

import { createKmsSignerFromPort, type KmsKeyPort } from '@features/battle/signer/signer.kms';
import {
    extractUncompressedPublicKey,
    parseDerSignature,
    toEthereumSignature,
} from '@features/battle/signer/signer.kms.crypto';

/**
 * The provider-independent half of KMS signing (§G).
 *
 * Exercised against a real secp256k1 key rather than fixtures, with the DER encoding a KMS
 * would return built here. Fixtures would pass while proving nothing about the two things
 * that actually break: DER integers are variable-length, and `v` is not in the signature at
 * all.
 */

const wallet = new ethers.Wallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const signingKey = new ethers.SigningKey(wallet.privateKey);
const ADDRESS = wallet.address.toLowerCase();

/** Encodes one DER INTEGER, minimally, with the sign byte ECDSA integers need. */
function derInteger(value: bigint): number[] {
    let hex = value.toString(16);
    if (hex.length % 2) hex = `0${hex}`;
    const bytes = [...Buffer.from(hex, 'hex')];
    // DER integers are signed: a leading byte >= 0x80 would read as negative, so a zero is
    // prepended. This is exactly the case a fixed-width slice gets wrong.
    if ((bytes[0] ?? 0) >= 0x80) bytes.unshift(0);
    return [0x02, bytes.length, ...bytes];
}

/** A KMS-shaped DER signature over `digest`, as AWS or GCP would return it. */
function derSignatureFor(digest: Uint8Array, options: { highS?: boolean } = {}): Uint8Array {
    const sig = signingKey.sign(digest);
    const n = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
    const s = options.highS ? n - BigInt(sig.s) : BigInt(sig.s);
    const body = [...derInteger(BigInt(sig.r)), ...derInteger(s)];
    return Uint8Array.from([0x30, body.length, ...body]);
}

const digestOf = (text: string): Uint8Array => ethers.getBytes(ethers.id(text));

describe('parseDerSignature', () => {
    it('reads r and s back from a real signature', () => {
        const digest = digestOf('battle');
        const expected = signingKey.sign(digest);

        const { r, s } = parseDerSignature(derSignatureFor(digest));

        expect(ethers.toBeHex(r, 32)).toBe(expected.r);
        expect(ethers.toBeHex(s, 32)).toBe(expected.s);
    });

    it('refuses input that is not a DER sequence', () => {
        expect(() => parseDerSignature(Uint8Array.from([0x02, 0x01, 0x00]))).toThrow(/SEQUENCE/);
    });

    it('refuses trailing bytes rather than ignoring them', () => {
        const good = derSignatureFor(digestOf('battle'));
        const padded = Uint8Array.from([...good, 0x00]);
        // The length check catches it first; either way it must not parse.
        expect(() => parseDerSignature(padded)).toThrow();
    });
});

describe('toEthereumSignature', () => {
    /**
     * The recovery id is the whole reason this function needs the address: `v` is not part
     * of an ECDSA signature and no KMS returns it, so it is found by trying both.
     */
    it('produces a signature that recovers to the signing key', () => {
        const digest = digestOf('receipt');

        const signature = toEthereumSignature(derSignatureFor(digest), digest, ADDRESS);

        expect(ethers.recoverAddress(digest, signature).toLowerCase()).toBe(ADDRESS);
    });

    it('matches what an in-process signer would have produced', () => {
        // The KMS path and the local path must be indistinguishable to a verifier, or a
        // rotation between backends would change what receipts look like.
        const digest = digestOf('same-digest');

        expect(toEthereumSignature(derSignatureFor(digest), digest, ADDRESS)).toBe(
            signingKey.sign(digest).serialized,
        );
    });

    // EIP-2 rejects the high half, and a KMS has no reason to avoid it, so roughly half of
    // all signatures would be refused on chain without this.
    it('normalizes a high-s signature into the canonical low-s form', () => {
        const digest = digestOf('malleable');

        const normalized = toEthereumSignature(derSignatureFor(digest, { highS: true }), digest, ADDRESS);

        expect(ethers.recoverAddress(digest, normalized).toLowerCase()).toBe(ADDRESS);
        expect(normalized).toBe(signingKey.sign(digest).serialized);
    });

    it('refuses a signature from a key other than the published one', () => {
        // A mismatch means the KMS signed with different material than the registry
        // publishes, which would make every receipt unverifiable. Better to fail loudly.
        const digest = digestOf('wrong-key');
        const other = ethers.Wallet.createRandom().address;

        expect(() => toEthereumSignature(derSignatureFor(digest), digest, other)).toThrow(
            /does not recover to the published key/,
        );
    });

    it('refuses a digest that is not 32 bytes', () => {
        expect(() => toEthereumSignature(derSignatureFor(digestOf('x')), new Uint8Array(31), ADDRESS)).toThrow(
            /32-byte digest/,
        );
    });
});

describe('extractUncompressedPublicKey', () => {
    it('finds the point at the end of an SPKI wrapper', () => {
        // The real prefix is an AlgorithmIdentifier; its content does not matter here, only
        // that the point is read from the end and validated.
        const spki = Uint8Array.from([
            ...Buffer.from('3056301006072a8648ce3d020106052b8104000a034200', 'hex'),
            ...ethers.getBytes(signingKey.publicKey),
        ]);

        expect(extractUncompressedPublicKey(spki)).toBe(signingKey.publicKey);
    });

    it('refuses DER that does not end in an uncompressed point', () => {
        expect(() => extractUncompressedPublicKey(new Uint8Array(80))).toThrow(/uncompressed/);
    });
});

describe('createKmsSignerFromPort', () => {
    const port: KmsKeyPort = {
        provider: 'test-kms',
        getPublicKeyDer: async () =>
            Uint8Array.from([
                ...Buffer.from('3056301006072a8648ce3d020106052b8104000a034200', 'hex'),
                ...ethers.getBytes(signingKey.publicKey),
            ]),
        signDigest: async (digest) => derSignatureFor(digest),
    };

    /**
     * The address is derived from what the KMS publishes, never configured. A configured
     * one is a second copy of the truth, and if it drifted the signer would publish one key
     * while signing with another.
     */
    it('derives its published key from the KMS rather than configuration', async () => {
        const backend = await createKmsSignerFromPort({ port, keyId: 'kms-1', notBefore: 1000 });

        expect(backend.key.address).toBe(ADDRESS);
        expect(backend.key.publicKey).toBe(signingKey.publicKey);
        expect(backend.key.algorithm).toBe('secp256k1');
    });

    it('signs a digest into a signature that recovers to that key', async () => {
        const backend = await createKmsSignerFromPort({ port, keyId: 'kms-1', notBefore: 1000 });
        const digest = digestOf('end-to-end');

        const signature = await backend.sign(digest);

        expect(ethers.recoverAddress(digest, signature).toLowerCase()).toBe(backend.key.address);
    });

    it('refuses to sign anything that is not a 32-byte digest', async () => {
        const backend = await createKmsSignerFromPort({ port, keyId: 'kms-1', notBefore: 1000 });

        await expect(backend.sign(new Uint8Array(20))).rejects.toThrow(/32-byte digest/);
    });
});
