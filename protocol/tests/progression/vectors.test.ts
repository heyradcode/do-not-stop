import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { ChainId } from '../../src/domain/chainId';
import { computeProgression, type PetProgression } from '../../src/progression';
import type { BattleSnapshot, PetSnapshot } from '../../src/snapshot';

/**
 * Consumes contracts/test-vectors/protocol-progression.json. A failure means the
 * implementation drifted, and the fix is the code, never the vector (`AGENTS.md`).
 *
 * The formula and decay are pinned cross-language by `xp.json` (see
 * `tests/combat/xpGoldenVectors.test.ts`). These cases pin the composition around
 * them, which is where a port is most likely to go wrong: swapping which base
 * applies to whom, or applying the winner's decay shift to the loser.
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

interface SerializedProgression {
    petId: string;
    won: boolean;
    decayShift: number;
    xpAwarded: number;
    lastOpponentId: string;
    streak: number;
    level: number;
    xp: number;
    leveledUp: boolean;
}

interface ProgressionCase {
    name: string;
    note: string;
    snapshot: {
        chainId: string;
        deploymentId: string;
        attacker: PetFixture;
        defender: PetFixture;
        takenAt: number;
    };
    attackerWon: boolean;
    maxLevel: number;
    expected: { attacker: SerializedProgression; defender: SerializedProgression };
}

const here = dirname(fileURLToPath(import.meta.url));
const vectorsPath = join(here, '../../../contracts/test-vectors/protocol-progression.json');
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')) as { cases: ProgressionCase[] };

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

function toSnapshot(c: ProgressionCase): BattleSnapshot {
    return {
        domain: { chainId: c.snapshot.chainId as ChainId, deploymentId: c.snapshot.deploymentId },
        attacker: toPet(c.snapshot.attacker),
        defender: toPet(c.snapshot.defender),
        takenAt: c.snapshot.takenAt,
    };
}

function serialize(progression: PetProgression): SerializedProgression {
    return {
        petId: progression.petId.toString(),
        won: progression.won,
        decayShift: progression.decayShift,
        xpAwarded: progression.xpAwarded,
        lastOpponentId: progression.lastOpponentId.toString(),
        streak: progression.streak,
        level: progression.level,
        xp: progression.xp,
        leveledUp: progression.leveledUp,
    };
}

const byName = new Map(vectors.cases.map((c) => [c.name, c]));
const deltaOf = (name: string) => {
    const found = byName.get(name);
    if (!found) throw new Error(`vector case missing: ${name}`);
    return computeProgression(toSnapshot(found), found.attackerWon, { maxLevel: found.maxLevel });
};

describe('progression golden vectors', () => {
    for (const c of vectors.cases) {
        it(`matches the recorded delta for "${c.name}"`, () => {
            const delta = computeProgression(toSnapshot(c), c.attackerWon, { maxLevel: c.maxLevel });
            expect(serialize(delta.attacker)).toEqual(c.expected.attacker);
            expect(serialize(delta.defender)).toEqual(c.expected.defender);
        });
    }
});

describe('properties the vectors exist to pin', () => {
    it('gives the winner the winner base and the loser the loser base', () => {
        const attackerWins = deltaOf('attacker-wins-fresh');
        const defenderWins = deltaOf('defender-wins');
        // Same pets, same levels, only the winner differs, so the awards must swap
        // rather than stay attached to a role.
        expect(attackerWins.attacker.xpAwarded).toBeGreaterThan(attackerWins.defender.xpAwarded);
        expect(defenderWins.attacker.won).toBe(false);
        expect(defenderWins.defender.won).toBe(true);
    });

    it('applies each pet own decay shift, not the winner shift to both', () => {
        const delta = deltaOf('attacker-wins-fresh');
        // Attacker faces a new opponent (shift 0); defender is on a streak (shift 3).
        expect(delta.attacker.decayShift).toBe(0);
        expect(delta.defender.decayShift).toBe(3);
    });

    it('advances both streaks on a rematch', () => {
        const delta = deltaOf('rematch-both-streaked');
        expect(delta.attacker.streak).toBe(1);
        expect(delta.defender.streak).toBe(1);
    });

    it('leaves level and XP untouched when decay zeroes the award', () => {
        const delta = deltaOf('streak-zeroes-award');
        const source = byName.get('streak-zeroes-award')!;
        expect(delta.attacker.xpAwarded).toBe(0);
        expect(delta.attacker.xp).toBe(source.snapshot.attacker.xp);
        expect(delta.attacker.level).toBe(source.snapshot.attacker.level);
    });

    it('doubles for punching up and zeroes for punching down', () => {
        expect(deltaOf('punching-up').attacker.xpAwarded).toBe(200);
        expect(deltaOf('punching-down').attacker.xpAwarded).toBe(0);
    });

    it('reports the award at the level cap while crediting nothing', () => {
        // `xpAwarded` mirrors the on-chain event, which carries the computed number
        // whether or not the cap swallowed it. What was applied is level/xp.
        const delta = deltaOf('winner-at-level-cap');
        const source = byName.get('winner-at-level-cap')!;
        expect(delta.attacker.xpAwarded).toBeGreaterThan(0);
        expect(delta.attacker.xp).toBe(source.snapshot.attacker.xp);
        expect(delta.attacker.level).toBe(source.snapshot.attacker.level);
        // The loser is below the cap, so it still accrues.
        expect(delta.defender.xp).toBeGreaterThan(source.snapshot.defender.xp);
    });

    it('levels up and carries the remainder', () => {
        const delta = deltaOf('level-up-on-win');
        expect(delta.attacker.leveledUp).toBe(true);
        expect(delta.attacker.level).toBe(11);
        expect(delta.attacker.xp).toBe(60);
    });
});
