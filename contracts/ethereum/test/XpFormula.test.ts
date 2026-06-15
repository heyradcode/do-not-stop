import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Cross-chain parity fixture (plan §3.4, §7): contracts/test-vectors/xp.json pins the XP
// formula and same-opponent decay sequences shared by GameLogic._calcXp /
// PetCore.recordBattleOpponent (EVM) and settle_battle::calc_xp /
// PetAccount::record_battle_opponent (Solana).

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const fixture = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../test-vectors/xp.json"), "utf-8")
) as { calcXpCases: CalcXpCase[]; decaySequences: DecaySequence[] };

// Mirrors GameLogic._calcXp / settle_battle::calc_xp.
function calcXp(baseXp: number, myLevel: number, oppLevel: number): number {
    const diff = oppLevel - myLevel;
    let mult = 100 + 10 * diff;
    if (mult <= 0) return 0;
    if (mult > 200) mult = 200;
    return Math.floor((baseXp * mult) / 100);
}

// Mirrors PetCore.recordBattleOpponent / PetAccount::record_battle_opponent, starting from
// a fresh pet (lastOpponentId = 0, streak = 0).
class OpponentTracker {
    lastOpponentId = 0;
    streak = 0;

    record(opponentId: number): number {
        if (this.lastOpponentId === opponentId) {
            if (this.streak < 255) this.streak++;
        } else {
            this.lastOpponentId = opponentId;
            this.streak = 0;
        }
        return this.streak;
    }
}

describe("XP formula + same-opponent decay golden vectors (plan §3.4, §7)", () => {
    for (const c of fixture.calcXpCases) {
        it(`calcXp: ${c.name}`, () => {
            assert.equal(calcXp(c.baseXp, c.myLevel, c.oppLevel), c.expectedXp);
        });
    }

    for (const seq of fixture.decaySequences) {
        it(`decay sequence: ${seq.name}`, () => {
            const tracker = new OpponentTracker();
            for (let i = 0; i < seq.opponentIds.length; i++) {
                const shift = tracker.record(seq.opponentIds[i]);
                assert.equal(shift, seq.expectedDecayShifts[i], `decay shift at step ${i}`);

                const xp = calcXp(seq.baseXp, 10, 10) >> shift;
                assert.equal(xp, seq.expectedXp[i], `xp at step ${i}`);
            }
        });
    }
});
