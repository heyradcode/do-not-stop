import type { Hex } from '@cryptopets/protocol';
import { ethers } from 'ethers';

/**
 * Turning what a KMS returns into what an EVM verifier expects (§G).
 *
 * Every managed KMS that supports secp256k1 hands back an ECDSA signature in the form the
 * X.509 world uses, and Ethereum wants a different one. Three gaps, none of them optional:
 *
 * 1. **Encoding.** AWS and GCP return a DER `SEQUENCE { INTEGER r, INTEGER s }`. Ethereum
 *    wants fixed 32-byte `r` and `s`. DER integers are signed and minimally encoded, so
 *    they carry a leading zero when the high bit is set and drop leading zeros otherwise:
 *    a naive slice produces a signature that verifies to the wrong address roughly half
 *    the time, which is exactly the kind of bug that looks like "KMS is flaky".
 * 2. **Malleability.** For any valid `(r, s)`, `(r, n - s)` is equally valid. Ethereum
 *    rejects the high half (EIP-2), and a KMS has no reason to care, so `s` has to be
 *    normalized here or perhaps half of all signatures are refused on chain.
 * 3. **Recovery id.** Ethereum's `v` says which of two candidate public keys signed. It is
 *    not part of an ECDSA signature and no KMS returns it, so it is recovered by trying
 *    both and keeping the one that yields the known address.
 *
 * All of this is provider-independent, which is why it lives apart from any SDK: the
 * adapter's whole job becomes "fetch bytes, sign bytes", and the fiddly part is tested
 * without a cloud account.
 */

/** secp256k1 group order. `s` above half of this is the malleable form EIP-2 forbids. */
const SECP256K1_N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
const HALF_N = SECP256K1_N / 2n;

/**
 * Reads a DER `SEQUENCE { INTEGER r, INTEGER s }`.
 *
 * Hand-parsed rather than pulled from a library because the shape is fixed and tiny, and a
 * general ASN.1 decoder would be a dependency whose failure modes are broader than the one
 * structure we ever see here.
 */
export function parseDerSignature(der: Uint8Array): { r: bigint; s: bigint } {
    let offset = 0;
    const readByte = (): number => {
        if (offset >= der.length) {
            throw new Error('DER signature ended early');
        }
        return der[offset++]!;
    };

    if (readByte() !== 0x30) {
        throw new Error('DER signature does not start with a SEQUENCE tag');
    }
    // Length byte. Short form only: an ECDSA signature is far below the 128-byte threshold
    // that would make this multi-byte, so a long form here means the input is not one.
    const seqLength = readByte();
    if (seqLength & 0x80) {
        throw new Error('DER signature uses long-form length, which an ECDSA signature never needs');
    }
    if (seqLength !== der.length - offset) {
        throw new Error(`DER signature length ${seqLength} does not match its ${der.length - offset} remaining bytes`);
    }

    const readInteger = (label: string): bigint => {
        if (readByte() !== 0x02) {
            throw new Error(`DER signature ${label} is not an INTEGER`);
        }
        const length = readByte();
        if (length === 0 || length > 33) {
            throw new Error(`DER signature ${label} has an implausible length ${length}`);
        }
        let value = 0n;
        for (let i = 0; i < length; i++) {
            value = (value << 8n) | BigInt(readByte());
        }
        return value;
    };

    const r = readInteger('r');
    const s = readInteger('s');
    if (offset !== der.length) {
        throw new Error('DER signature has trailing bytes');
    }
    return { r, s };
}

/**
 * Extracts the uncompressed public key point from a DER SubjectPublicKeyInfo.
 *
 * KMS providers publish the key as SPKI, which wraps the point in an AlgorithmIdentifier
 * and a BIT STRING. The point itself is the trailing 65 bytes beginning with `0x04`, and
 * that is what is taken: reading it positionally rather than fully decoding SPKI keeps this
 * honest about only understanding one shape, and it is checked rather than assumed.
 */
export function extractUncompressedPublicKey(spkiDer: Uint8Array): Hex {
    if (spkiDer.length < 65) {
        throw new Error(`public key DER is too short to contain a point (${spkiDer.length} bytes)`);
    }
    const point = spkiDer.subarray(spkiDer.length - 65);
    if (point[0] !== 0x04) {
        throw new Error('public key DER does not end in an uncompressed secp256k1 point');
    }
    return ethers.hexlify(point) as Hex;
}

/**
 * Assembles an Ethereum signature from a KMS response.
 *
 * `expectedAddress` is what decides `v`, and passing it is deliberate: it means this
 * function cannot return a signature that recovers to somebody else. If neither candidate
 * matches, that is a genuine mismatch between the key the KMS signed with and the key this
 * process published, and it throws rather than returning a plausible-looking signature that
 * would be rejected later with no explanation.
 */
export function toEthereumSignature(
    derSignature: Uint8Array,
    digest: Uint8Array,
    expectedAddress: string,
): Hex {
    if (digest.length !== 32) {
        throw new Error(`expected a 32-byte digest, got ${digest.length}`);
    }
    const { r, s: rawS } = parseDerSignature(derSignature);

    // EIP-2: only the low half of the range is canonical. Flipping `s` produces an equally
    // valid signature over the same digest, so this changes nothing except acceptability.
    const s = rawS > HALF_N ? SECP256K1_N - rawS : rawS;

    const target = expectedAddress.toLowerCase();
    for (const v of [27, 28]) {
        const signature = ethers.Signature.from({
            r: ethers.toBeHex(r, 32),
            s: ethers.toBeHex(s, 32),
            v,
        });
        try {
            if (ethers.recoverAddress(digest, signature).toLowerCase() === target) {
                return signature.serialized as Hex;
            }
        } catch {
            // A candidate that does not recover at all is simply the wrong one.
        }
    }

    throw new Error(
        `KMS signature does not recover to the published key ${expectedAddress}; the key material and the registry disagree`,
    );
}
