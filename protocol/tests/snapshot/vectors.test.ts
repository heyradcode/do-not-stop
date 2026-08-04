import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { ChainId } from '../../src/domain/chainId';
import { type BattleSnapshot, hashBattleSnapshot, type PetSnapshot } from '../../src/snapshot';

/**
 * Consumes contracts/test-vectors/protocol-snapshot.json. A failure means the
 * encoding drifted, and the fix is the code, never the vector (`AGENTS.md`).
 */
interface PetFixture {
    petId: string;
    owner: string;
    dna: string;
    rarity: number;
    level: number;
    skill: number;
    xp: number;
    lastOpponentId: string;
    streak: number;
    readyAt: number;
    sourceVersion: string;
}

interface SnapshotCase {
    name: string;
    note: string;
    snapshot: {
        chainId: string;
        deploymentId: string;
        attacker: PetFixture;
        defender: PetFixture;
        takenAt: number;
    };
    expectedSnapshotHash: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const vectorsPath = join(here, '../../../contracts/test-vectors/protocol-snapshot.json');
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')) as { cases: SnapshotCase[] };

function toPet(fixture: PetFixture): PetSnapshot {
    return {
        petId: BigInt(fixture.petId),
        owner: fixture.owner,
        dna: BigInt(fixture.dna),
        rarity: fixture.rarity,
        level: fixture.level,
        skill: fixture.skill,
        xp: fixture.xp,
        lastOpponentId: BigInt(fixture.lastOpponentId),
        streak: fixture.streak,
        readyAt: fixture.readyAt,
        sourceVersion: BigInt(fixture.sourceVersion),
    };
}

function toSnapshot(c: SnapshotCase): BattleSnapshot {
    return {
        domain: { chainId: c.snapshot.chainId as ChainId, deploymentId: c.snapshot.deploymentId },
        attacker: toPet(c.snapshot.attacker),
        defender: toPet(c.snapshot.defender),
        takenAt: c.snapshot.takenAt,
    };
}

const byName = new Map(vectors.cases.map((c) => [c.name, c]));
const hashOf = (name: string) => {
    const found = byName.get(name);
    if (!found) throw new Error(`vector case missing: ${name}`);
    return hashBattleSnapshot(toSnapshot(found));
};

describe('snapshot golden vectors', () => {
    for (const c of vectors.cases) {
        it(`matches the recorded hash for "${c.name}"`, () => {
            expect(hashBattleSnapshot(toSnapshot(c))).toBe(c.expectedSnapshotHash);
        });
    }
});

describe('relationships the vectors exist to pin', () => {
    it('treats an EVM owner address as case-insensitive', () => {
        expect(hashOf('evm-checksummed-owner')).toBe(hashOf('evm-baseline'));
    });

    it('is not symmetric in the two roles', () => {
        // The result is stated from the attacker's perspective, so which pet is
        // which has to be part of the hash.
        expect(hashOf('evm-roles-swapped')).not.toBe(hashOf('evm-baseline'));
    });

    it('separates a level-up, which is the front-run this object exists to stop', () => {
        expect(hashOf('evm-level-up')).not.toBe(hashOf('evm-baseline'));
    });

    it('separates an advanced streak, since streak is an XP input', () => {
        expect(hashOf('evm-streak-advanced')).not.toBe(hashOf('evm-baseline'));
    });

    it('separates the same pet state read at a different chain version', () => {
        expect(hashOf('evm-other-source-version')).not.toBe(hashOf('evm-baseline'));
    });

    it('separates snapshots taken a second apart', () => {
        expect(hashOf('evm-later-takenAt')).not.toBe(hashOf('evm-baseline'));
    });

    it('separates chains', () => {
        expect(hashOf('solana-baseline')).not.toBe(hashOf('evm-baseline'));
    });

    it('produces a distinct hash for every case except the casing pair', () => {
        const hashes = vectors.cases
            .filter((c) => c.name !== 'evm-checksummed-owner')
            .map((c) => c.expectedSnapshotHash);
        expect(new Set(hashes).size).toBe(hashes.length);
    });
});
