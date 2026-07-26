import { secp256k1 } from '@noble/curves/secp256k1';

import { bytesToHex, hexToBytes, type Hex } from '../encoding/bytes';
import { keccak256 } from '../encoding/hash';

/**
 * Recovers the Ethereum-style address that produced a raw secp256k1 ECDSA signature over
 * `digest`.
 *
 * This exists so the standalone verifier (§H) can check the operator's signature over a
 * receipt without depending on `ethers` or any other PolyForm-licensed package — the
 * verifier's own dependency budget is `@cryptopets/protocol` and nothing else. The signature
 * format matches what `backend/src/features/battle-signer` produces: 65 bytes, `r (32) ||
 * s (32) || v (1)` with `v` in `{27, 28}` (legacy, unprefixed — no EIP-155 chain id encoded
 * into `v`, since this signs a receipt/commitment digest directly, never a transaction).
 *
 * `digest` must be the exact 32-byte value that was signed — this function does not hash
 * or prefix its input in any way (there is deliberately no EIP-191 `personal_sign` prefix
 * anywhere in this protocol's signing path; see `signer.local.ts`'s own comment for why).
 */
export function recoverAddress(digest: Hex, signature: Hex): Hex {
    const digestBytes = hexToBytes(digest);
    if (digestBytes.length !== 32) {
        throw new Error(`expected a 32-byte digest, got ${digestBytes.length} bytes`);
    }
    const sigBytes = hexToBytes(signature);
    if (sigBytes.length !== 65) {
        throw new Error(`expected a 65-byte r||s||v signature, got ${sigBytes.length} bytes`);
    }

    const r = sigBytes.slice(0, 32);
    const s = sigBytes.slice(32, 64);
    const v = sigBytes[64] as number;
    const recovery = v >= 27 ? v - 27 : v;
    if (recovery !== 0 && recovery !== 1) {
        throw new Error(`signature recovery byte ${v} does not resolve to 0 or 1`);
    }

    // noble's "recovered" wire format is recovery-byte-first, unlike Ethereum's
    // r||s||v (recovery byte last) — reordered here rather than pushed onto every caller.
    const recoveredFormat = new Uint8Array(65);
    recoveredFormat[0] = recovery;
    recoveredFormat.set(r, 1);
    recoveredFormat.set(s, 33);

    const parsedSignature = secp256k1.Signature.fromBytes(recoveredFormat, 'recovered');
    const point = parsedSignature.recoverPublicKey(digestBytes);
    const uncompressedPubkey = point.toBytes(false);
    const addressBytes = keccak256(uncompressedPubkey.slice(1)).slice(-20);
    return bytesToHex(addressBytes);
}
