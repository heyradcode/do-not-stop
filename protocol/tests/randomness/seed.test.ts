import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { simulate } from '../../src/combat';
import type { ChainId } from '../../src/domain/chainId';
import { bytesToHex, type Hex } from '../../src/encoding/bytes';
import { deriveBattleSeed, DRAND_RANDOMNESS_LENGTH, encodeSeedInputs, type SeedInputs } from '../../src/randomness';

interface SeedFixture {
    chainId: string;
    deploymentId: string;
    drandRandomness: string;
    battleId: string;
    snapshotHash: string;
    rulesetHash: string;
}

interface SeedCase {
    name: string;
    note: string;
    inputs: SeedFixture;
    expectedSeed: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const vectorsPath = join(here, '../../../contracts/test-vectors/protocol-seed.json');
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')) as { cases: SeedCase[] };

function toInputs(fixture: SeedFixture): SeedInputs {
    return {
        domain: { chainId: fixture.chainId as ChainId, deploymentId: fixture.deploymentId },
        drandRandomness: fixture.drandRandomness as Hex,
        battleId: fixture.battleId,
        snapshotHash: fixture.snapshotHash as Hex,
        rulesetHash: fixture.rulesetHash as Hex,
    };
}

const byName = new Map(vectors.cases.map((c) => [c.name, c]));
const seedOf = (name: string) => {
    const found = byName.get(name);
    if (!found) throw new Error(`vector case missing: ${name}`);
    return deriveBattleSeed(toInputs(found.inputs)).hex;
};

const BASE = toInputs(byName.get('baseline')!.inputs);

describe('seed golden vectors', () => {
    for (const c of vectors.cases) {
        it(`matches the recorded seed for "${c.name}"`, () => {
            expect(deriveBattleSeed(toInputs(c.inputs)).hex).toBe(c.expectedSeed);
        });
    }
});

describe('relationships the vectors exist to pin', () => {
    it('separates two battles bound to the same beacon round', () => {
        // One round seeds every battle committed to it, so the battle id is the
        // only thing keeping those fights from sharing randomness.
        expect(seedOf('other-battle-id')).not.toBe(seedOf('baseline'));
    });

    it('separates deployments and chains using the same round', () => {
        expect(seedOf('staging-deployment')).not.toBe(seedOf('baseline'));
        expect(seedOf('solana-chain')).not.toBe(seedOf('baseline'));
    });

    it('separates snapshots and rulesets', () => {
        expect(seedOf('other-snapshot')).not.toBe(seedOf('baseline'));
        expect(seedOf('other-ruleset')).not.toBe(seedOf('baseline'));
    });

    it('resists the framing ambiguity bare concatenation would allow', () => {
        // deployment "ab" + battle "c" versus "a" + "bc". Concatenated without
        // length prefixes these are one preimage; framed they are two.
        expect(seedOf('framing-ambiguity-a')).not.toBe(seedOf('framing-ambiguity-b'));
    });

    it('gives every case a distinct seed', () => {
        const seeds = vectors.cases.map((c) => c.expectedSeed);
        expect(new Set(seeds).size).toBe(seeds.length);
    });
});

describe('deriveBattleSeed', () => {
    it('returns the same value in hex and as a uint256', () => {
        const seed = deriveBattleSeed(BASE);
        expect(seed.value).toBe(BigInt(seed.hex));
        expect(seed.value).toBeLessThan(1n << 256n);
    });

    it('is deterministic', () => {
        expect(deriveBattleSeed(BASE).hex).toBe(deriveBattleSeed({ ...BASE }).hex);
    });

    it('accepts the beacon value as bytes or hex', () => {
        const asBytes = new Uint8Array(DRAND_RANDOMNESS_LENGTH).fill(0xff);
        expect(deriveBattleSeed({ ...BASE, drandRandomness: asBytes }).hex).toBe(
            deriveBattleSeed({ ...BASE, drandRandomness: bytesToHex(asBytes) }).hex,
        );
    });

    it('avalanches on a single flipped bit of beacon randomness', () => {
        // A weak derivation could let a nearly-identical beacon value produce a
        // nearly-identical seed, which would make outcomes partly predictable
        // across rounds.
        const a = seedOf('baseline');
        const b = seedOf('randomness-one-bit');
        const differingBytes = countDifferingBytes(a, b);
        expect(differingBytes).toBeGreaterThan(20);
    });

    it('feeds the simulator directly', () => {
        const seed = deriveBattleSeed(BASE);
        const outcome = simulate(1234567890123456n, 3, 10, 4, 6543210987654321n, 2, 11, 7, seed.value);
        expect(outcome.result.rounds).toBeGreaterThan(0);
    });
});

describe('validation', () => {
    it.each([
        [31, 'too short'],
        [33, 'too long'],
        [48, 'a BLS signature rather than the randomness'],
    ])('rejects %s-byte randomness (%s)', (length) => {
        expect(() => deriveBattleSeed({ ...BASE, drandRandomness: new Uint8Array(length) })).toThrow(
            /drandRandomness must be 32 bytes/,
        );
    });

    it('rejects malformed hex randomness', () => {
        expect(() => deriveBattleSeed({ ...BASE, drandRandomness: '0xabc' as Hex })).toThrow();
    });

    it.each(['', 'battle id with spaces', 'a'.repeat(65), 'id\nwith-newline'])(
        'rejects battleId %j',
        (battleId) => {
            expect(() => deriveBattleSeed({ ...BASE, battleId })).toThrow(/battleId/);
        },
    );

    it('rejects a snapshot or ruleset hash that is not 32 bytes', () => {
        expect(() => deriveBattleSeed({ ...BASE, snapshotHash: '0x1234' })).toThrow(/32-byte/);
        expect(() => deriveBattleSeed({ ...BASE, rulesetHash: '0x1234' })).toThrow(/32-byte/);
    });

    it('rejects an invalid domain', () => {
        expect(() => deriveBattleSeed({ ...BASE, domain: { ...BASE.domain, deploymentId: 'Bad Id' } })).toThrow(
            /invalid deploymentId/,
        );
    });
});

describe('encodeSeedInputs', () => {
    it('exposes the preimage so a mismatch can be localized', () => {
        // Comparing 32-byte digests tells you two implementations disagree;
        // comparing preimages tells you which field.
        const preimage = bytesToHex(encodeSeedInputs(BASE));
        expect(preimage.startsWith('0x00000014')).toBe(true); // 20-byte domain tag
        expect(preimage).toContain(BASE.drandRandomness.toString().slice(2));
    });

    it('changes whenever the derived seed changes', () => {
        const a = bytesToHex(encodeSeedInputs(BASE));
        const b = bytesToHex(encodeSeedInputs({ ...BASE, battleId: 'other-battle' }));
        expect(a).not.toBe(b);
    });
});

function countDifferingBytes(a: string, b: string): number {
    let differing = 0;
    for (let i = 2; i < a.length; i += 2) {
        if (a.slice(i, i + 2) !== b.slice(i, i + 2)) differing++;
    }
    return differing;
}
