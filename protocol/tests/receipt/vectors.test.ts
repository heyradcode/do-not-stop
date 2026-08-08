import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { simulate } from '../../src/combat';
import type { ChainId } from '../../src/domain/chainId';
import type { Hex } from '../../src/encoding/bytes';
import { computeProgression } from '../../src/progression';
import { deriveBattleSeed } from '../../src/randomness';
import { type BattleReceipt, hashBattleReceipt, hashCombatLog } from '../../src/receipt';
import { hashRuleset, type Ruleset, SOURCE_DEFAULT_RULESET } from '../../src/ruleset';
import { type BattleSnapshot, hashBattleSnapshot, type PetSnapshot } from '../../src/snapshot';

/**
 * Consumes contracts/test-vectors/protocol-receipt.json. A failure means the
 * implementation drifted, and the fix is the code, never the vector (`AGENTS.md`).
 *
 * The fixtures are inputs, not full receipts: the seed, result, combat-log hash, and
 * progression are rebuilt here the same way the generator built them. That makes this
 * test cover the composition too, since a receipt whose seed does not follow from its own
 * inputs is rejected outright by validation.
 */
/**
 * The ruleset these vectors were generated under.
 *
 * Pinned rather than read from `SOURCE_DEFAULT_RULESET`, which tracks whatever this build
 * currently implements. Taking the live constant made the vectors follow an engine bump
 * instead of catching it: a receipt records the rules its fight actually ran under, and
 * these fixtures ran under engine 1 with no item catalog. Anything else here still fails,
 * which is the point — a change to the skill defaults is drift in the fight rules.
 */
const VECTOR_RULESET: Ruleset = {
    ...SOURCE_DEFAULT_RULESET,
    engineVersion: 1,
    schemaVersion: 1,
    itemCatalog: [],
};

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

interface ReceiptFixture {
    chainId: string;
    deploymentId: string;
    battleId: string;
    intentHash: string;
    commitmentHash: string;
    defenseAuthorizationHash: string;
    snapshot: {
        chainId: string;
        deploymentId: string;
        attacker: PetFixture;
        defender: PetFixture;
        takenAt: number;
    };
    beacon: { chainHash: string; round: number; signature: string; randomness: string; publishedAt: number };
    attackerWon: boolean;
    maxLevel: number;
    sequence: number;
    previousReceiptHash: string | null;
    attackerPreviousReceiptHash: string | null;
    defenderPreviousReceiptHash: string | null;
    createdAt: number;
    signingKeyId: string;
}

interface ReceiptCase {
    name: string;
    note: string;
    fixture: ReceiptFixture;
    derived: { seed: string; rulesetHash: string; combatLogHash: string; result: unknown };
    expectedReceiptHash: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const vectorsPath = join(here, '../../../contracts/test-vectors/protocol-receipt.json');
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')) as { cases: ReceiptCase[] };

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

export function buildReceipt(fixture: ReceiptFixture): BattleReceipt {
    const snapshot: BattleSnapshot = {
        domain: { chainId: fixture.snapshot.chainId as ChainId, deploymentId: fixture.snapshot.deploymentId },
        attacker: toPet(fixture.snapshot.attacker),
        defender: toPet(fixture.snapshot.defender),
        takenAt: fixture.snapshot.takenAt,
    };
    const domain = { chainId: fixture.chainId as ChainId, deploymentId: fixture.deploymentId };
    const rulesetHash = hashRuleset(VECTOR_RULESET);
    const seed = deriveBattleSeed({
        domain,
        drandRandomness: fixture.beacon.randomness as Hex,
        battleId: fixture.battleId,
        snapshotHash: hashBattleSnapshot(snapshot),
        rulesetHash,
    });
    const outcome = simulate(
        snapshot.attacker.dna,
        snapshot.attacker.rarity,
        snapshot.attacker.level,
        snapshot.attacker.skill,
        snapshot.defender.dna,
        snapshot.defender.rarity,
        snapshot.defender.level,
        snapshot.defender.skill,
        seed.value,
        VECTOR_RULESET.skillConfig,
    );

    return {
        domain,
        battleId: fixture.battleId,
        intentHash: fixture.intentHash as Hex,
        commitmentHash: fixture.commitmentHash as Hex,
        defenseAuthorizationHash: fixture.defenseAuthorizationHash as Hex,
        snapshot,
        beacon: {
            chainHash: fixture.beacon.chainHash as Hex,
            round: fixture.beacon.round,
            signature: fixture.beacon.signature as Hex,
            randomness: fixture.beacon.randomness as Hex,
        },
        seed: seed.hex,
        rulesetVersion: VECTOR_RULESET.version,
        rulesetHash,
        result: {
            attackerWon: fixture.attackerWon,
            rounds: outcome.result.rounds,
            winnerHpRemaining: outcome.result.winnerHpRemaining,
        },
        combatLogHash: hashCombatLog(outcome),
        progression: computeProgression(snapshot, fixture.attackerWon, { maxLevel: fixture.maxLevel }),
        sequence: fixture.sequence,
        previousReceiptHash: fixture.previousReceiptHash as Hex | null,
        attackerPreviousReceiptHash: fixture.attackerPreviousReceiptHash as Hex | null,
        defenderPreviousReceiptHash: fixture.defenderPreviousReceiptHash as Hex | null,
        createdAt: fixture.createdAt,
        signingKeyId: fixture.signingKeyId,
    };
}

const byName = new Map(vectors.cases.map((c) => [c.name, c]));
const hashOf = (name: string) => {
    const found = byName.get(name);
    if (!found) throw new Error(`vector case missing: ${name}`);
    return hashBattleReceipt(buildReceipt(found.fixture));
};

describe('receipt golden vectors', () => {
    for (const c of vectors.cases) {
        it(`matches the recorded hash for "${c.name}"`, () => {
            expect(hashBattleReceipt(buildReceipt(c.fixture))).toBe(c.expectedReceiptHash);
        });

        it(`reproduces the recorded derived values for "${c.name}"`, () => {
            // The seed, combat-log hash, and result are derived rather than supplied, so
            // recording them means a drift in seed derivation or in the fight itself shows
            // up as its own failure instead of as an opaque receipt-hash mismatch.
            const receipt = buildReceipt(c.fixture);
            expect(receipt.seed).toBe(c.derived.seed);
            expect(receipt.rulesetHash).toBe(c.derived.rulesetHash);
            expect(receipt.combatLogHash).toBe(c.derived.combatLogHash);
            expect(receipt.result).toEqual(c.derived.result);
        });
    }
});

describe('relationships the vectors exist to pin', () => {
    it('separates a linked receipt from an unlinked one', () => {
        expect(hashOf('linked-receipt')).not.toBe(hashOf('first-receipt-under-key'));
    });

    it('separates one present per-pet link from none', () => {
        expect(hashOf('attacker-first-battle-defender-veteran')).not.toBe(hashOf('first-receipt-under-key'));
    });

    it('separates the two outcomes', () => {
        expect(hashOf('defender-wins')).not.toBe(hashOf('first-receipt-under-key'));
    });

    it('separates beacons, keys, deployments, and chains', () => {
        const base = hashOf('first-receipt-under-key');
        expect(hashOf('later-beacon-round')).not.toBe(base);
        expect(hashOf('other-signing-key')).not.toBe(base);
        expect(hashOf('staging-deployment')).not.toBe(base);
        expect(hashOf('solana-deployment')).not.toBe(base);
    });

    it('gives every case a distinct hash', () => {
        const hashes = vectors.cases.map((c) => c.expectedReceiptHash);
        expect(new Set(hashes).size).toBe(hashes.length);
    });
});

export { vectors as receiptVectors };
