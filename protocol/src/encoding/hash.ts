import { keccak_256 } from '@noble/hashes/sha3';

import { bytesToHex, type Hex } from './bytes';

/** Digest length in bytes. Every hash in this protocol is 32 bytes. */
export const HASH_LENGTH = 32;

/**
 * Legacy Keccak-256, **not** SHA3-256.
 *
 * This is the same function as Solidity's `keccak256`, so hashes computed here
 * match `CombatSim.sol` and anything the contracts sign or verify. The two
 * differ only in a padding byte, so a SHA3-256 substitution produces plausible
 * looking digests that agree with nothing. `tests/encoding/hash.test.ts` pins
 * known Keccak digests specifically to catch that swap.
 */
export function keccak256(data: Uint8Array): Uint8Array {
    return keccak_256(data);
}

/** Legacy Keccak-256 as a 0x-prefixed lowercase hex string. */
export function keccak256Hex(data: Uint8Array): Hex {
    return bytesToHex(keccak_256(data));
}
