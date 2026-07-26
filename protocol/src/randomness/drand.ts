import { bls12_381 } from '@noble/curves/bls12-381';
import { sha256 } from '@noble/hashes/sha256';

import { bytesToHex, type Hex, toBytes, uintToBytes } from '../encoding/bytes';

/**
 * drand beacon verification.
 *
 * The point of using drand is that nobody here controls the randomness. That only
 * holds if the beacon value is *verified* rather than accepted: an unverified
 * beacon is just a number the backend handed over, which is exactly the situation
 * commit-before-reveal exists to escape. So the client verifies too (§E), against
 * a pinned public key, not against a key supplied alongside the value.
 *
 * Only quicknet is supported, deliberately. It publishes every 3 seconds, which
 * keeps time-to-first-animation in the 3-6 second range the UX needs, and its
 * scheme is unchained, so a round can be verified on its own without walking the
 * chain back to genesis.
 */

/** The only scheme this protocol verifies. */
export const SUPPORTED_SCHEME = 'bls-unchained-g1-rfc9380';

/** Pinned parameters of one drand chain. */
export interface DrandChain {
    /** Identifies the chain. Receipts record it so a verifier knows which config to load. */
    chainHash: Hex;
    /** 96-byte compressed G2 group public key. */
    publicKey: Hex;
    scheme: typeof SUPPORTED_SCHEME;
    periodSeconds: number;
    genesisTimeSeconds: number;
}

/**
 * drand quicknet, pinned.
 *
 * Verified against the live network on 2026-07-26 (`tests/fixtures/drand.json`).
 * These values are consensus parameters, not configuration: a wrong public key
 * here does not fail loudly, it accepts forged beacons. They must never be read
 * from a receipt, an environment variable, or an API response.
 */
export const QUICKNET: DrandChain = {
    chainHash: '0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971',
    publicKey:
        '0x83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a',
    scheme: SUPPORTED_SCHEME,
    periodSeconds: 3,
    genesisTimeSeconds: 1692803367,
};

/** Every chain this build will verify, by chain hash. */
const PINNED_CHAINS: readonly DrandChain[] = [QUICKNET];

/**
 * How far ahead a commitment reserves its round: a constant, never a per-battle
 * choice (§E).
 *
 * A per-battle offset would hand the operator exactly the freedom the
 * pre-commitment removes, since choosing "how far ahead" repeatedly is a way of
 * choosing which value lands. Two rounds on quicknet is 3-6 seconds depending on
 * where in the current round the request arrives.
 */
export const COMMITMENT_OFFSET_ROUNDS = 2;

/** Length of a quicknet signature: compressed G1. */
export const BEACON_SIGNATURE_LENGTH = 48;
/** Length of a quicknet group public key: compressed G2. */
const PUBLIC_KEY_LENGTH = 96;

/** One published beacon. */
export interface Beacon {
    round: number;
    /** 48-byte compressed G1 signature. */
    signature: Hex | Uint8Array;
}

/** A beacon that has been verified against a pinned chain. */
export interface VerifiedBeacon {
    chainHash: Hex;
    round: number;
    signature: Hex;
    /** sha256 of the signature: the value seed derivation consumes. */
    randomness: Hex;
}

/**
 * Resolves the pinned chain for a chain hash.
 *
 * A verifier reads `drandChainHash` from a receipt and must map it to a *pinned*
 * config here. Taking the public key from the receipt instead would let whoever
 * wrote the receipt choose the key that validates it, which is not verification.
 */
export function resolveDrandChain(chainHash: string): DrandChain {
    // Accepts either spelling: receipts store 0x-prefixed hex, drand's own API
    // returns it bare. Matching on only one form turns a formatting difference
    // into "unknown chain", which reads like a security failure and is not one.
    const lower = chainHash.toLowerCase();
    const normalized = lower.startsWith('0x') ? lower : `0x${lower}`;
    const found = PINNED_CHAINS.find((chain) => chain.chainHash === normalized);
    if (!found) {
        throw new Error(`drand chain ${chainHash} is not pinned by this build; refusing to verify against it`);
    }
    return found;
}

/**
 * The message a quicknet round signs: sha256 of the round number as a big-endian
 * uint64. Unchained, so no previous signature is mixed in, which is what lets one
 * round be verified in isolation.
 */
export function beaconMessage(round: number): Uint8Array {
    assertRound(round);
    return sha256(uintToBytes(round, 8));
}

/** The randomness a signature yields: sha256 of the signature bytes. */
export function beaconRandomness(signature: Hex | Uint8Array): Hex {
    return bytesToHex(sha256(assertSignature(signature)));
}

/**
 * Verifies a beacon's BLS signature against a pinned chain.
 *
 * Returns false for a signature that does not verify, including a malformed one:
 * from a caller's perspective "this beacon is not genuine" is one answer. Throws
 * only for a misconfigured chain, which is our bug rather than a bad input.
 */
export function verifyBeacon(chain: DrandChain, beacon: Beacon): boolean {
    assertChain(chain);
    let signature: Uint8Array;
    try {
        signature = assertSignature(beacon.signature);
    } catch {
        return false;
    }
    try {
        const messagePoint = bls12_381.shortSignatures.hash(beaconMessage(beacon.round));
        return bls12_381.shortSignatures.verify(signature, messagePoint, toBytes(chain.publicKey));
    } catch {
        // An uncompressible point or an off-curve signature is an invalid beacon,
        // not an exception the caller should have to handle separately.
        return false;
    }
}

/**
 * Verifies a beacon and returns it with its derived randomness, or throws.
 *
 * This is the function the accept-to-settle path should use: it makes "we used an
 * unverified beacon" impossible to express, because the only way to get the
 * randomness out is to have verified the signature that produced it.
 */
export function assertVerifiedBeacon(chain: DrandChain, beacon: Beacon): VerifiedBeacon {
    if (!verifyBeacon(chain, beacon)) {
        throw new Error(`drand round ${beacon.round} failed BLS verification against chain ${chain.chainHash}`);
    }
    const signature = bytesToHex(assertSignature(beacon.signature));
    return {
        chainHash: chain.chainHash,
        round: beacon.round,
        signature,
        randomness: beaconRandomness(signature),
    };
}

/** Unix seconds at which `round` is published. */
export function roundTime(chain: DrandChain, round: number): number {
    assertRound(round);
    return chain.genesisTimeSeconds + round * chain.periodSeconds;
}

/** The most recent round published at `unixSeconds`, or 0 before the first. */
export function latestRoundAt(chain: DrandChain, unixSeconds: number): number {
    if (!Number.isSafeInteger(unixSeconds)) {
        throw new Error(`unixSeconds must be an integer, got ${unixSeconds}`);
    }
    if (unixSeconds < chain.genesisTimeSeconds + chain.periodSeconds) {
        return 0;
    }
    return Math.floor((unixSeconds - chain.genesisTimeSeconds) / chain.periodSeconds);
}

/**
 * The round a commitment made at `nowSeconds` must name: the latest published
 * round plus the fixed offset. Mechanical by construction, so there is no decision
 * to audit.
 */
export function commitmentRound(chain: DrandChain, nowSeconds: number): number {
    return latestRoundAt(chain, nowSeconds) + COMMITMENT_OFFSET_ROUNDS;
}

function assertChain(chain: DrandChain): void {
    if (chain.scheme !== SUPPORTED_SCHEME) {
        // A chained chain needs the previous signature in its message, so verifying
        // it with this code would be wrong rather than merely unsupported.
        throw new Error(`unsupported drand scheme ${chain.scheme}; only ${SUPPORTED_SCHEME} is verifiable here`);
    }
    if (toBytes(chain.publicKey).length !== PUBLIC_KEY_LENGTH) {
        throw new Error(`drand public key must be ${PUBLIC_KEY_LENGTH} bytes (compressed G2)`);
    }
    if (!Number.isSafeInteger(chain.periodSeconds) || chain.periodSeconds < 1) {
        throw new Error(`drand period must be a positive integer, got ${chain.periodSeconds}`);
    }
}

function assertRound(round: number): void {
    if (!Number.isSafeInteger(round) || round < 1) {
        throw new Error(`drand round must be a positive integer, got ${round}`);
    }
}

function assertSignature(signature: Hex | Uint8Array): Uint8Array {
    const bytes = toBytes(signature);
    if (bytes.length !== BEACON_SIGNATURE_LENGTH) {
        throw new Error(
            `beacon signature must be ${BEACON_SIGNATURE_LENGTH} bytes (compressed G1), got ${bytes.length}`,
        );
    }
    return bytes;
}
