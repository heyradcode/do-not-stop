import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { bytesToHex, type Hex } from '../../src/encoding/bytes';
import {
    assertVerifiedBeacon,
    beaconMessage,
    beaconRandomness,
    COMMITMENT_OFFSET_ROUNDS,
    commitmentRound,
    type DrandChain,
    latestRoundAt,
    QUICKNET,
    resolveDrandChain,
    roundTime,
    SUPPORTED_SCHEME,
    verifyBeacon,
} from '../../src/randomness';

/**
 * Tests against real drand output (`tests/fixtures/drand.json`, fetched 2026-07-26).
 *
 * Synthetic keypairs would prove the BLS plumbing works while leaving the part
 * that actually matters untested: whether the pinned quicknet public key, the
 * message construction, and the hash-to-curve domain all match the live network.
 * Any one of those being wrong fails every real round and no synthetic one.
 */
interface Fixture {
    quicknet: {
        info: {
            public_key: string;
            period: number;
            genesis_time: number;
            chain_hash: string;
            scheme: string;
        };
        rounds: { round: number; signature: string; randomness: string }[];
    };
    chainedChain: {
        info: { public_key: string; chain_hash: string; scheme: string; period: number; genesis_time: number };
        round: { round: number; signature: string };
    };
}

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, '../fixtures/drand.json'), 'utf8')) as Fixture;
const hex = (value: string): Hex => `0x${value}`;

describe('pinned quicknet parameters', () => {
    it('match the live chain info', () => {
        // If this fails, either the pinned constants were edited or drand changed
        // its parameters. Either way, nothing should verify until it is understood.
        expect(QUICKNET.chainHash).toBe(hex(fixture.quicknet.info.chain_hash));
        expect(QUICKNET.publicKey).toBe(hex(fixture.quicknet.info.public_key));
        expect(QUICKNET.periodSeconds).toBe(fixture.quicknet.info.period);
        expect(QUICKNET.genesisTimeSeconds).toBe(fixture.quicknet.info.genesis_time);
        expect(QUICKNET.scheme).toBe(fixture.quicknet.info.scheme);
        expect(SUPPORTED_SCHEME).toBe('bls-unchained-g1-rfc9380');
    });
});

describe('verifyBeacon', () => {
    for (const round of fixture.quicknet.rounds) {
        it(`verifies real quicknet round ${round.round}`, () => {
            expect(verifyBeacon(QUICKNET, { round: round.round, signature: hex(round.signature) })).toBe(true);
        });
    }

    it('rejects a signature presented under the wrong round number', () => {
        // The round number is the message, so this is the check that stops a real
        // signature being replayed as a different round's value.
        const [first, second] = fixture.quicknet.rounds;
        expect(verifyBeacon(QUICKNET, { round: second!.round, signature: hex(first!.signature) })).toBe(false);
    });

    it('rejects a tampered signature', () => {
        const original = fixture.quicknet.rounds[0]!;
        const bytes = Uint8Array.from(Buffer.from(original.signature, 'hex'));
        bytes.set([bytes[47]! ^ 0x01], 47);
        expect(verifyBeacon(QUICKNET, { round: original.round, signature: bytesToHex(bytes) })).toBe(false);
    });

    it('rejects a malformed signature without throwing', () => {
        // A bad input is "not a genuine beacon", one of the two answers this
        // function has, not an exception every call site must handle.
        expect(verifyBeacon(QUICKNET, { round: 1, signature: '0x00' })).toBe(false);
        expect(verifyBeacon(QUICKNET, { round: 1, signature: new Uint8Array(48) })).toBe(false);
    });

    it('rejects a signature from another chain', () => {
        const other = fixture.chainedChain.round;
        expect(verifyBeacon(QUICKNET, { round: other.round, signature: hex(other.signature) })).toBe(false);
    });

    it('throws for a chain whose scheme this build cannot verify', () => {
        // Chained schemes mix the previous signature into the message, so verifying
        // one with this code would be wrong rather than unsupported.
        const chained = {
            ...QUICKNET,
            scheme: fixture.chainedChain.info.scheme,
        } as unknown as DrandChain;
        expect(() => verifyBeacon(chained, { round: 1, signature: hex(fixture.quicknet.rounds[0]!.signature) })).toThrow(
            /unsupported drand scheme/,
        );
    });

    it('throws for a public key of the wrong length', () => {
        const bad = { ...QUICKNET, publicKey: hex(fixture.chainedChain.info.public_key) };
        expect(() => verifyBeacon(bad, { round: 1, signature: hex(fixture.quicknet.rounds[0]!.signature) })).toThrow(
            /must be 96 bytes/,
        );
    });
});

describe('beaconRandomness', () => {
    for (const round of fixture.quicknet.rounds) {
        it(`derives the randomness drand itself publishes for round ${round.round}`, () => {
            // Independently sourced: these values come from drand's own API, not
            // from this implementation, so they pin sha256(signature) rather than
            // restating whatever we compute.
            expect(beaconRandomness(hex(round.signature))).toBe(hex(round.randomness));
        });
    }

    it('rejects a signature of the wrong length', () => {
        expect(() => beaconRandomness(new Uint8Array(32))).toThrow(/48 bytes/);
    });
});

describe('assertVerifiedBeacon', () => {
    it('returns the verified beacon with its randomness', () => {
        const round = fixture.quicknet.rounds[1]!;
        expect(assertVerifiedBeacon(QUICKNET, { round: round.round, signature: hex(round.signature) })).toEqual({
            chainHash: QUICKNET.chainHash,
            round: round.round,
            signature: hex(round.signature),
            randomness: hex(round.randomness),
        });
    });

    it('throws rather than returning randomness for an unverified beacon', () => {
        // The only way to obtain randomness through this function is to have
        // verified the signature that produced it, so "we used an unverified
        // beacon" is not expressible.
        expect(() => assertVerifiedBeacon(QUICKNET, { round: 2, signature: hex(fixture.quicknet.rounds[0]!.signature) })).toThrow(
            /failed BLS verification/,
        );
    });
});

describe('resolveDrandChain', () => {
    it('resolves quicknet whether the hash is prefixed, bare, or uppercase', () => {
        // Receipts carry 0x-prefixed hex; drand's API returns it bare. Both have to
        // resolve, or a formatting difference reads like an unknown chain.
        expect(resolveDrandChain(QUICKNET.chainHash)).toBe(QUICKNET);
        expect(resolveDrandChain(fixture.quicknet.info.chain_hash)).toBe(QUICKNET);
        expect(resolveDrandChain(fixture.quicknet.info.chain_hash.toUpperCase())).toBe(QUICKNET);
        expect(resolveDrandChain(QUICKNET.chainHash.toUpperCase().replace('0X', '0x'))).toBe(QUICKNET);
    });

    it('refuses a chain this build does not pin', () => {
        // A verifier reads the chain hash from a receipt. Accepting an unknown one,
        // with a public key from the same receipt, would let the receipt's author
        // choose the key that validates it.
        expect(() => resolveDrandChain(hex(fixture.chainedChain.info.chain_hash))).toThrow(/is not pinned/);
    });
});

describe('round timing', () => {
    it('places round n at genesis + n * period', () => {
        expect(roundTime(QUICKNET, 1)).toBe(QUICKNET.genesisTimeSeconds + 3);
        expect(roundTime(QUICKNET, 1000)).toBe(QUICKNET.genesisTimeSeconds + 3000);
    });

    it('round-trips through latestRoundAt', () => {
        for (const round of [1, 2, 1000, 21000000, 30753975]) {
            expect(latestRoundAt(QUICKNET, roundTime(QUICKNET, round))).toBe(round);
        }
    });

    it('holds the round steady across its whole period', () => {
        const time = roundTime(QUICKNET, 500);
        expect(latestRoundAt(QUICKNET, time)).toBe(500);
        expect(latestRoundAt(QUICKNET, time + 1)).toBe(500);
        expect(latestRoundAt(QUICKNET, time + 2)).toBe(500);
        expect(latestRoundAt(QUICKNET, time + 3)).toBe(501);
    });

    it('reports 0 before the first round', () => {
        expect(latestRoundAt(QUICKNET, QUICKNET.genesisTimeSeconds)).toBe(0);
        expect(latestRoundAt(QUICKNET, 0)).toBe(0);
    });

    it('rejects a non-integer round or time', () => {
        expect(() => roundTime(QUICKNET, 1.5)).toThrow(/positive integer/);
        expect(() => roundTime(QUICKNET, 0)).toThrow(/positive integer/);
        expect(() => latestRoundAt(QUICKNET, 1.5)).toThrow(/must be an integer/);
    });
});

describe('commitmentRound', () => {
    it('is the latest round plus a fixed offset', () => {
        const now = roundTime(QUICKNET, 1000);
        expect(commitmentRound(QUICKNET, now)).toBe(1000 + COMMITMENT_OFFSET_ROUNDS);
        expect(COMMITMENT_OFFSET_ROUNDS).toBe(2);
    });

    it('always names a round that has not published yet', () => {
        // The property the whole scheme rests on: at commitment time, the value
        // being committed to does not exist.
        for (const offsetIntoPeriod of [0, 1, 2]) {
            const now = roundTime(QUICKNET, 5000) + offsetIntoPeriod;
            const round = commitmentRound(QUICKNET, now);
            expect(roundTime(QUICKNET, round)).toBeGreaterThan(now);
        }
    });

    it('lands within the UX budget of 3 to 6 seconds', () => {
        for (const offsetIntoPeriod of [0, 1, 2]) {
            const now = roundTime(QUICKNET, 5000) + offsetIntoPeriod;
            const wait = roundTime(QUICKNET, commitmentRound(QUICKNET, now)) - now;
            expect(wait).toBeGreaterThanOrEqual(3);
            expect(wait).toBeLessThanOrEqual(6);
        }
    });
});

describe('beaconMessage', () => {
    it('is sha256 of the round as a big-endian uint64', () => {
        // Pinned by the real-round verifications above; asserted here so a change
        // to the encoding fails with a readable name instead of as "every round is
        // suddenly invalid".
        expect(bytesToHex(beaconMessage(1))).toBe(
            '0xcd2662154e6d76b2b2b92e70c0cac3ccf534f9b74eb5b89819ec509083d00a50',
        );
        expect(bytesToHex(beaconMessage(1000))).toBe(
            '0xf652498d092acd949bad74e40683bf3824fb817980504a0c7e6722cfc5a9c0a3',
        );
    });

    it('rejects a round below 1', () => {
        expect(() => beaconMessage(0)).toThrow(/positive integer/);
    });
});
