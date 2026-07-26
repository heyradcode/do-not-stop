import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { simulate, type SimOutcome, type SkillConfig } from '../../src/combat';

/**
 * Consumes contracts/test-vectors/battle.json directly — the same file
 * Hardhat (CombatGoldenVectors.test.ts), Anchor, and indexer-go
 * (combat_golden_test.go) already consume. No separate vector format. If a
 * case fails here, this TS port has drifted from the other three
 * implementations; fix the port, never the vector.
 */
interface BattleVectorCase {
    name: string;
    dna1: string;
    rarity1: number;
    level1: number;
    skill1: number;
    dna2: string;
    rarity2: number;
    level2: number;
    skill2: number;
    seed: string;
    expected: { firstWins: boolean; rounds: number; winnerHpRemaining: number };
}

interface BattleVectorFile {
    skillConfig: SkillConfig;
    cases: BattleVectorCase[];
}

const here = dirname(fileURLToPath(import.meta.url));
const vectorsPath = join(here, '../../../contracts/test-vectors/battle.json');
const vectors: BattleVectorFile = JSON.parse(readFileSync(vectorsPath, 'utf8'));

// Internal consistency check, independent of the golden expectations: the log
// must actually explain the result it's attached to. This would catch a bug
// where the log-recording path diverges from the math it's supposed to be a
// write-only view onto.
function assertLogExplainsResult(outcome: SimOutcome): void {
    const { result, log } = outcome;
    expect(log.length).toBeGreaterThan(0);
    const last = log[log.length - 1];
    // Narrowing for this package's `noUncheckedIndexedAccess`; the length
    // assertion above is the real check.
    if (!last) throw new Error('combat log is empty');
    expect(last.round).toBe(result.rounds - 1);
    const winnerHp = result.firstWins ? last.hp1After : last.hp2After;
    const cappedWinnerHp = winnerHp > 0xffffn ? 0xffffn : winnerHp;
    expect(Number(cappedWinnerHp)).toBe(result.winnerHpRemaining);
}

describe('combat sim golden vectors (plan §7)', () => {
    for (const c of vectors.cases) {
        it(`matches recorded result for "${c.name}"`, () => {
            const outcome = simulate(
                BigInt(c.dna1), c.rarity1, c.level1, c.skill1,
                BigInt(c.dna2), c.rarity2, c.level2, c.skill2,
                BigInt(c.seed), vectors.skillConfig,
            );
            expect(outcome.result.firstWins).toBe(c.expected.firstWins);
            expect(outcome.result.rounds).toBe(c.expected.rounds);
            expect(outcome.result.winnerHpRemaining).toBe(c.expected.winnerHpRemaining);
            assertLogExplainsResult(outcome);
        });
    }
});
