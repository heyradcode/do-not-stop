import { describe, expect, it } from 'vitest';

import {
    applyDecayShift,
    applyXp,
    BASE_XP_LOSS,
    BASE_XP_WIN,
    calcXp,
    DEFAULT_MAX_LEVEL,
    MAX_DECAY_SHIFT,
    MAX_SAME_OPPONENT_STREAK,
    recordBattleOpponent,
} from '../../src/combat';

describe('calcXp', () => {
    it('uses the base values the chains use', () => {
        expect(BASE_XP_WIN).toBe(100);
        expect(BASE_XP_LOSS).toBe(25);
    });

    it('floors rather than rounds, matching integer division on chain', () => {
        // 25 * 150 / 100 = 37.5 on chain becomes 37, not 38.
        expect(calcXp(25, 10, 15)).toBe(37);
    });

    it('clamps the multiplier at both ends', () => {
        expect(calcXp(100, 10, 20)).toBe(200); // +10 levels, cap
        expect(calcXp(100, 10, 30)).toBe(200); // beyond cap, same
        expect(calcXp(100, 20, 10)).toBe(0); // -10 levels, floor
        expect(calcXp(100, 30, 10)).toBe(0); // beyond floor, same
    });

    it('returns 0 rather than a negative award', () => {
        expect(calcXp(100, 100, 1)).toBe(0);
    });
});

describe('applyDecayShift', () => {
    it('halves per streak step', () => {
        expect(applyDecayShift(100, 0)).toBe(100);
        expect(applyDecayShift(100, 1)).toBe(50);
        expect(applyDecayShift(100, 2)).toBe(25);
        expect(applyDecayShift(100, 3)).toBe(12);
    });

    it('clamps the shift, because JavaScript would otherwise pay full XP', () => {
        // `200 >> 32` is 200 in JavaScript: `>>` masks the count to 5 bits. Solidity
        // yields 0 at or past the operand width, Rust clamps to 31, Go yields 0. Without
        // the clamp this port would pay full XP exactly where the chains pay none.
        expect(applyDecayShift(200, 32)).toBe(0);
        expect(applyDecayShift(200, 33)).toBe(0);
        expect(applyDecayShift(200, MAX_SAME_OPPONENT_STREAK)).toBe(0);
        expect(MAX_DECAY_SHIFT).toBe(31);
    });

    it('reaches zero well before the clamp for real award sizes', () => {
        // Base XP is at most 200, so any streak of 8 or more already pays nothing on
        // every implementation. The clamp only matters for correctness of the tail.
        expect(applyDecayShift(200, 8)).toBe(0);
    });
});

describe('recordBattleOpponent', () => {
    it('starts a fresh pet at no decay', () => {
        expect(recordBattleOpponent({ lastOpponentId: 0n, streak: 0 }, 7n)).toEqual({
            lastOpponentId: 7n,
            streak: 0,
            decayShift: 0,
        });
    });

    it('advances the streak on a rematch', () => {
        expect(recordBattleOpponent({ lastOpponentId: 7n, streak: 0 }, 7n)).toEqual({
            lastOpponentId: 7n,
            streak: 1,
            decayShift: 1,
        });
        expect(recordBattleOpponent({ lastOpponentId: 7n, streak: 1 }, 7n)).toEqual({
            lastOpponentId: 7n,
            streak: 2,
            decayShift: 2,
        });
    });

    it('resets when the opponent changes', () => {
        expect(recordBattleOpponent({ lastOpponentId: 7n, streak: 5 }, 9n)).toEqual({
            lastOpponentId: 9n,
            streak: 0,
            decayShift: 0,
        });
    });

    it('saturates the streak instead of wrapping', () => {
        // uint8 on both chains: `if (streak < type(uint8).max) streak++`.
        expect(recordBattleOpponent({ lastOpponentId: 7n, streak: MAX_SAME_OPPONENT_STREAK }, 7n)).toEqual({
            lastOpponentId: 7n,
            streak: MAX_SAME_OPPONENT_STREAK,
            decayShift: MAX_SAME_OPPONENT_STREAK,
        });
    });

    it('treats opponent 0 as a real change for a pet whose last opponent was real', () => {
        expect(recordBattleOpponent({ lastOpponentId: 7n, streak: 3 }, 0n).streak).toBe(0);
    });
});

describe('applyXp', () => {
    it('accrues XP below the threshold', () => {
        expect(applyXp({ level: 10, xp: 120 }, 200)).toEqual({ level: 10, xp: 320, leveledUp: false });
    });

    it('levels up at exactly the threshold and carries the remainder', () => {
        // threshold = 100 * level, subtracted rather than zeroed.
        expect(applyXp({ level: 10, xp: 900 }, 100)).toEqual({ level: 11, xp: 0, leveledUp: true });
        expect(applyXp({ level: 10, xp: 950 }, 100)).toEqual({ level: 11, xp: 50, leveledUp: true });
    });

    it('advances at most one level per battle', () => {
        // 5000 XP at level 1 clears many thresholds; the chains still advance once.
        expect(applyXp({ level: 1, xp: 0 }, 5000)).toEqual({ level: 2, xp: 4900, leveledUp: true });
    });

    it('accrues nothing at all at the level cap', () => {
        // The on-chain version returns before touching xp, so this is "no accrual",
        // not "capped accrual".
        expect(applyXp({ level: DEFAULT_MAX_LEVEL, xp: 10 }, 500)).toEqual({
            level: DEFAULT_MAX_LEVEL,
            xp: 10,
            leveledUp: false,
        });
    });

    it('respects a lowered cap from the ruleset', () => {
        expect(applyXp({ level: 20, xp: 0 }, 5000, 20)).toEqual({ level: 20, xp: 0, leveledUp: false });
        // threshold at level 19 is 1900, so 2000 XP leaves 100 after the level-up.
        expect(applyXp({ level: 19, xp: 1900 }, 100, 20)).toEqual({ level: 20, xp: 100, leveledUp: true });
    });

    it('handles a level-1 pet, whose threshold is 100', () => {
        expect(applyXp({ level: 1, xp: 0 }, 99)).toEqual({ level: 1, xp: 99, leveledUp: false });
        expect(applyXp({ level: 1, xp: 0 }, 100)).toEqual({ level: 2, xp: 0, leveledUp: true });
    });
});
