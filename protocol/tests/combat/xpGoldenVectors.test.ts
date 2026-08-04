import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { applyDecayShift, calcXp, recordBattleOpponent } from '../../src/combat';

/**
 * Consumes contracts/test-vectors/xp.json directly, the same file Hardhat
 * (`GameLogic._calcXp`), Anchor (`game::xp::calc_xp`), and indexer-go
 * (`xp.go`) already consume. No separate vector format, and no new expectations
 * invented for this port: it either agrees with the three existing
 * implementations or it does not.
 *
 * If a case fails, this TypeScript port drifted. Fix the port, never the vector.
 */
interface CalcXpCase {
    name: string;
    baseXp: number;
    myLevel: number;
    oppLevel: number;
    expectedXp: number;
}

interface DecaySequence {
    name: string;
    opponentIds: number[];
    expectedDecayShifts: number[];
    baseXp: number;
    expectedXp: number[];
}

const here = dirname(fileURLToPath(import.meta.url));
const vectorsPath = join(here, '../../../contracts/test-vectors/xp.json');
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')) as {
    calcXpCases: CalcXpCase[];
    decaySequences: DecaySequence[];
};

describe('calcXp golden vectors', () => {
    for (const c of vectors.calcXpCases) {
        it(`matches "${c.name}"`, () => {
            expect(calcXp(c.baseXp, c.myLevel, c.oppLevel)).toBe(c.expectedXp);
        });
    }
});

describe('same-opponent decay golden vectors', () => {
    for (const sequence of vectors.decaySequences) {
        it(`reproduces the decay shifts for "${sequence.name}"`, () => {
            // Folded from a fresh pet (lastOpponentId 0, streak 0), exactly as the
            // vector file describes and as `applyDecay` does in xp.go.
            let history = { lastOpponentId: 0n, streak: 0 };
            const shifts: number[] = [];
            for (const opponentId of sequence.opponentIds) {
                const update = recordBattleOpponent(history, BigInt(opponentId));
                shifts.push(update.decayShift);
                history = { lastOpponentId: update.lastOpponentId, streak: update.streak };
            }
            expect(shifts).toEqual(sequence.expectedDecayShifts);
        });

        it(`reproduces the decayed XP for "${sequence.name}"`, () => {
            const awarded = sequence.expectedDecayShifts.map((shift) =>
                applyDecayShift(calcXp(sequence.baseXp, 10, 10), shift),
            );
            expect(awarded).toEqual(sequence.expectedXp);
        });
    }
});
