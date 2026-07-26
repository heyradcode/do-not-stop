import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { type BattleCommitment, hashBattleCommitment } from '../../src/commitment';
import type { ChainId } from '../../src/domain/chainId';
import type { Hex } from '../../src/encoding/bytes';
import type { BattleSnapshot, PetSnapshot } from '../../src/snapshot';

/**
 * Consumes contracts/test-vectors/protocol-commitment.json. A failure means the
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

interface CommitmentFixture {
    chainId: string;
    deploymentId: string;
    battleId: string;
    intentHash: string;
    defenseAuthorizationHash: string;
    snapshot: {
        chainId: string;
        deploymentId: string;
        attacker: PetFixture;
        defender: PetFixture;
        takenAt: number;
    };
    rulesetVersion: number;
    rulesetHash: string;
    drandChainHash: string;
    drandRound: number;
    acceptedAt: number;
    previousCommitmentHash: string | null;
    signingKeyId: string;
}

interface CommitmentCase {
    name: string;
    note: string;
    commitment: CommitmentFixture;
    expectedCommitmentHash: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const vectorsPath = join(here, '../../../contracts/test-vectors/protocol-commitment.json');
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')) as { cases: CommitmentCase[] };

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

function toSnapshot(fixture: CommitmentFixture['snapshot']): BattleSnapshot {
    return {
        domain: { chainId: fixture.chainId as ChainId, deploymentId: fixture.deploymentId },
        attacker: toPet(fixture.attacker),
        defender: toPet(fixture.defender),
        takenAt: fixture.takenAt,
    };
}

export function toCommitment(fixture: CommitmentFixture): BattleCommitment {
    return {
        domain: { chainId: fixture.chainId as ChainId, deploymentId: fixture.deploymentId },
        battleId: fixture.battleId,
        intentHash: fixture.intentHash as Hex,
        defenseAuthorizationHash: fixture.defenseAuthorizationHash as Hex,
        snapshot: toSnapshot(fixture.snapshot),
        rulesetVersion: fixture.rulesetVersion,
        rulesetHash: fixture.rulesetHash as Hex,
        drandChainHash: fixture.drandChainHash as Hex,
        drandRound: fixture.drandRound,
        acceptedAt: fixture.acceptedAt,
        previousCommitmentHash: fixture.previousCommitmentHash as Hex | null,
        signingKeyId: fixture.signingKeyId,
    };
}

const byName = new Map(vectors.cases.map((c) => [c.name, c]));
const hashOf = (name: string) => {
    const found = byName.get(name);
    if (!found) throw new Error(`vector case missing: ${name}`);
    return hashBattleCommitment(toCommitment(found.commitment));
};

describe('commitment golden vectors', () => {
    for (const c of vectors.cases) {
        it(`matches the recorded hash for "${c.name}"`, () => {
            expect(hashBattleCommitment(toCommitment(c.commitment))).toBe(c.expectedCommitmentHash);
        });
    }
});

describe('relationships the vectors exist to pin', () => {
    it('separates a commitment naming a different round', () => {
        // The substitution a reroll needs. Two signatures over one battleId with
        // different digests is what makes the lie provable.
        expect(hashOf('other-committed-round')).not.toBe(hashOf('baseline'));
    });

    it('separates an absent chain link from a present one', () => {
        expect(hashOf('genesis-no-previous')).not.toBe(hashOf('baseline'));
    });

    it('separates a changed snapshot', () => {
        expect(hashOf('levelled-up-snapshot')).not.toBe(hashOf('baseline'));
    });

    it('separates a different intent and a different consent', () => {
        expect(hashOf('other-intent')).not.toBe(hashOf('baseline'));
        expect(hashOf('other-consent')).not.toBe(hashOf('baseline'));
    });

    it('separates ruleset versions and signing keys', () => {
        expect(hashOf('other-ruleset-version')).not.toBe(hashOf('baseline'));
        expect(hashOf('other-signing-key')).not.toBe(hashOf('baseline'));
    });

    it('gives every case a distinct hash', () => {
        const hashes = vectors.cases.map((c) => c.expectedCommitmentHash);
        expect(new Set(hashes).size).toBe(hashes.length);
    });
});

export { vectors as commitmentVectors };
