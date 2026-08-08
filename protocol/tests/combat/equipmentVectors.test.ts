import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { type AttrBonus, bonusFromEquipment, NO_BONUS, simulate, sumBonuses } from '../../src/combat';
import type { SkillConfig } from '../../src/combat/skills';

/**
 * Consumes contracts/test-vectors/equipment.json (roadmap §4). A failure means this port
 * drifted from the rules geared battles were settled under, and the fix is the code, never
 * the vector (`AGENTS.md`).
 *
 * `services/indexer-go/internal/combat` is held to the same file. The two ports were
 * written to disagree if either drifts, which is the whole value of §F's circuit breaker,
 * and a vector file only one of them reads would quietly disarm it.
 */

interface EquipmentCase {
    name: string;
    note: string;
    dna1: string; rarity1: number; level1: number; skill1: number; bonus1: AttrBonus;
    dna2: string; rarity2: number; level2: number; skill2: number; bonus2: AttrBonus;
    seed: string;
    expected: {
        firstWins: boolean;
        rounds: number;
        winnerHpRemaining: number;
        startHp1: number;
        startHp2: number;
    };
}

const here = dirname(fileURLToPath(import.meta.url));
const load = <T>(name: string): T =>
    JSON.parse(readFileSync(join(here, '../../../contracts/test-vectors/', name), 'utf8')) as T;

const vectors = load<{ skillConfig: SkillConfig; cases: EquipmentCase[] }>('equipment.json');
const battleVectors = load<{ cases: { name: string; expected: EquipmentCase['expected'] }[] }>('battle.json');

function run(c: EquipmentCase) {
    return simulate(
        BigInt(c.dna1), c.rarity1, c.level1, c.skill1,
        BigInt(c.dna2), c.rarity2, c.level2, c.skill2,
        BigInt(c.seed), vectors.skillConfig, c.bonus1, c.bonus2,
    );
}

describe('equipment golden vectors', () => {
    for (const c of vectors.cases) {
        it(`reproduces "${c.name}"`, () => {
            const outcome = run(c);
            expect({
                firstWins: outcome.result.firstWins,
                rounds: outcome.result.rounds,
                winnerHpRemaining: outcome.result.winnerHpRemaining,
                startHp1: Number(outcome.startHp1),
                startHp2: Number(outcome.startHp2),
            }).toEqual(c.expected);
        });
    }
});

describe('properties the vectors exist to pin', () => {
    const byName = new Map(vectors.cases.map((c) => [c.name, c]));

    // The compatibility claim, checked against the other file rather than asserted: adding
    // the modifier path must cost an ungeared fight nothing, and battle.json is what says
    // what an ungeared fight produces.
    it('leaves an ungeared fight identical to the one battle.json already records', () => {
        const geared = byName.get('ungeared-matches-battle-json')!;
        const baseline = battleVectors.cases.find((c) => c.name === 'baseline-no-skill')!;

        expect(geared.expected.firstWins).toBe(baseline.expected.firstWins);
        expect(geared.expected.rounds).toBe(baseline.expected.rounds);
        expect(geared.expected.winnerHpRemaining).toBe(baseline.expected.winnerHpRemaining);
    });

    // Gear applies before the skill multiplier, so Tank's +20% multiplies the geared
    // total. Computed here rather than restated, so the assertion fails if the order moves.
    it('applies gear before the skill multiplier, not after', () => {
        const c = byName.get('gear-before-tank')!;
        // The same pet without Tank and without gear, so this is its extracted HP exactly.
        // Taken from the ungeared case rather than divided back out of the Tank case: the
        // multiplier floors, so undoing it loses a point and the two orderings differ by
        // one, which is precisely the margin under test.
        const extracted = byName.get('ungeared-matches-battle-json')!.expected.startHp1;
        const tank = vectors.skillConfig.tankHpMult;

        const gearedThenTank = Math.floor(((extracted + c.bonus1.hp) * tank) / 100);
        const tankThenGeared = Math.floor((extracted * tank) / 100) + c.bonus1.hp;

        expect(c.expected.startHp1).toBe(gearedThenTank);
        expect(c.expected.startHp1).not.toBe(tankThenGeared);
    });

    // Saturating, not wrapping. A wrapping addition would turn a well-geared pet into a
    // nearly dead one the moment its HP crossed 65536.
    it('clamps a bonus at 16 bits instead of wrapping it', () => {
        expect(byName.get('clamped-at-u16')!.expected.startHp1).toBe(65535);
    });

    // Gear reaches initiative, not only damage: INT decides who strikes first.
    it('lets a bonus change who strikes first', () => {
        const c = byName.get('int-bonus-flips-initiative')!;
        expect(c.dna1).toBe(c.dna2); // identical pets, so only the bonus can differ
        expect(run({ ...c, bonus1: NO_BONUS }).result.firstWins).not.toBe(c.expected.firstWins);
    });

    it('is unaffected by the order items are summed in', () => {
        const parts: AttrBonus[] = [
            { hp: 12, atk: 4, def: 0, int: 0, mdef: 0 },
            { hp: 30, atk: 0, def: 10, int: 0, mdef: 0 },
            { hp: 0, atk: 0, def: 0, int: 12, mdef: 8 },
        ];
        expect(sumBonuses(parts)).toEqual(sumBonuses([...parts].reverse()));
    });
});

describe('bonusFromEquipment', () => {
    // The one summation every replaying consumer shares. It exists because the backend and
    // the verifier each had their own, and two implementations of one addition diverge into
    // an unexplained replay mismatch where the arithmetic is the last thing suspected.
    it('totals the five attributes and ignores the fields the engine does not read', () => {
        expect(
            bonusFromEquipment([
                { slot: 0, itemType: 1n, hp: 0, atk: 4, def: 0, int: 0, mdef: 0 },
                { slot: 1, itemType: 11n, hp: 30, atk: 0, def: 10, int: 0, mdef: 0 },
            ] as never),
        ).toEqual({ hp: 30, atk: 4, def: 10, int: 0, mdef: 0 });
    });

    it('treats an absent list as ungeared', () => {
        expect(bonusFromEquipment(undefined)).toEqual(NO_BONUS);
    });

    // Returns a fresh object, so a caller mutating its result cannot poison NO_BONUS for
    // every later ungeared fight in the process.
    it('does not hand back the shared NO_BONUS instance', () => {
        const first = bonusFromEquipment(undefined);
        first.atk = 99;
        expect(bonusFromEquipment(undefined)).toEqual(NO_BONUS);
        expect(NO_BONUS.atk).toBe(0);
    });
});
