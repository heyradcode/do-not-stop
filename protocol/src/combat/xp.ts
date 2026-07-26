/**
 * XP and level progression, ported from the on-chain implementations:
 * `GameLogic._calcXp` + `PetCore.addXp` + `PetCore.recordBattleOpponent` (Solidity),
 * `game::xp::calc_xp` + `PetAccount::add_xp` + `PetAccount::record_battle_opponent`
 * (Rust), and `indexer-go/internal/combat/xp.go` (Go, which covers the formula and
 * the decay but not level-up).
 *
 * Validated against `contracts/test-vectors/xp.json`, the same file Hardhat, Anchor,
 * and indexer-go consume. If a case fails, this port drifted; fix the port, never
 * the vector.
 *
 * Pure number math, no snapshot awareness. The snapshot-shaped wrapper that turns a
 * battle result into a progression delta lives in `src/progression/`, so this file
 * stays a line-for-line analogue of its siblings.
 */

/** Base XP for the winner, before the level multiplier and decay. */
export const BASE_XP_WIN = 100;
/** Base XP for the loser. */
export const BASE_XP_LOSS = 25;
/** XP needed to advance: `100 * currentLevel`. */
export const XP_PER_LEVEL_MULTIPLIER = 100;
/** `sameOpponentStreak` is a uint8 on both chains and saturates rather than wrapping. */
export const MAX_SAME_OPPONENT_STREAK = 255;
/**
 * Ceiling on the decay shift.
 *
 * The streak can reach 255, but the XP being shifted is a uint32. Solidity defines a
 * shift at or past the operand width as 0; Rust would panic with overflow checks on,
 * so `settle_battle.rs` clamps with `.min(31)`; Go also yields 0. JavaScript is the
 * odd one out: `>>` masks the shift count to 5 bits, so `200 >> 32` is `200`, not 0.
 * Clamping here is what keeps this port from silently paying full XP exactly where
 * the chains pay none.
 */
export const MAX_DECAY_SHIFT = 31;

/** Default level cap, mirroring `GameConfig.maxLevel`'s initializer. Owner-tunable on chain. */
export const DEFAULT_MAX_LEVEL = 100;

/**
 * XP for one battle before decay:
 * `baseXp * clamp(100 + 10 * (oppLevel - myLevel), 0, 200) / 100`.
 *
 * Punching up ten levels pays double; fighting ten levels down pays nothing.
 */
export function calcXp(baseXp: number, myLevel: number, oppLevel: number): number {
    const diff = oppLevel - myLevel;
    const mult = 100 + 10 * diff;
    if (mult <= 0) {
        return 0;
    }
    const capped = mult > 200 ? 200 : mult;
    return Math.floor((baseXp * capped) / 100);
}

/** Applies same-opponent decay to an XP award. */
export function applyDecayShift(xp: number, decayShift: number): number {
    const shift = decayShift > MAX_DECAY_SHIFT ? MAX_DECAY_SHIFT : decayShift;
    return xp >>> shift;
}

/** A pet's same-opponent tracking state, as frozen in a snapshot. */
export interface OpponentHistory {
    /** Previous opponent, or 0 for a pet that has not fought. */
    lastOpponentId: bigint;
    /** Consecutive prior battles against `lastOpponentId`. */
    streak: number;
}

/** `OpponentHistory` after a battle, plus the shift that battle earned. */
export interface OpponentHistoryUpdate extends OpponentHistory {
    /** XP right-shift for this battle: 0 = full, 1 = half, 2 = quarter. */
    decayShift: number;
}

/**
 * Advances a pet's same-opponent history, mirroring `recordBattleOpponent`.
 *
 * Fighting the same opponent again increments the streak (saturating at 255) and the
 * new value is the shift, so the second consecutive rematch pays half, the third a
 * quarter. Facing anyone else resets to 0, which is why grinding one opponent stops
 * being worth it while switching targets always pays full.
 */
export function recordBattleOpponent(history: OpponentHistory, opponentId: bigint): OpponentHistoryUpdate {
    if (history.lastOpponentId === opponentId) {
        const streak =
            history.streak < MAX_SAME_OPPONENT_STREAK ? history.streak + 1 : MAX_SAME_OPPONENT_STREAK;
        return { lastOpponentId: history.lastOpponentId, streak, decayShift: streak };
    }
    return { lastOpponentId: opponentId, streak: 0, decayShift: 0 };
}

/** A pet's level and XP. */
export interface LevelState {
    level: number;
    xp: number;
}

/** `LevelState` after an XP award. */
export interface LevelStateUpdate extends LevelState {
    leveledUp: boolean;
}

/**
 * Credits XP and advances at most one level, mirroring `PetCore.addXp` /
 * `PetAccount::add_xp`.
 *
 * Three behaviours worth being explicit about, because all three are easy to
 * "improve" into a divergence from the chains:
 *
 * - A pet at the level cap accrues nothing at all. Not capped XP, none: the on-chain
 *   version returns before touching `xp`.
 * - At most one level per battle. Leftover XP beyond a second threshold stays as XP.
 * - The threshold is `100 * level` at the pre-increment level.
 */
export function applyXp(state: LevelState, amount: number, maxLevel: number = DEFAULT_MAX_LEVEL): LevelStateUpdate {
    if (state.level >= maxLevel) {
        return { level: state.level, xp: state.xp, leveledUp: false };
    }
    let xp = state.xp + amount;
    let level = state.level;
    const threshold = XP_PER_LEVEL_MULTIPLIER * level;
    let leveledUp = false;
    if (xp >= threshold) {
        xp -= threshold;
        level += 1;
        if (level > maxLevel) {
            level = maxLevel;
        }
        leveledUp = true;
    }
    return { level, xp, leveledUp };
}
